// Configuración del Backend Google Apps Script (Web App)
const API_URL = "https://script.google.com/macros/s/AKfycbwAiNExyTPU6WSUVBNGvN-r9gZY9_C9XvWUhfcTwT-EkpEWfdY5kYm9Fq9N2utstLsAyw/exec";

// Variables globales de estado
let currentProfile = null;
let currentDeadline = null;
let allSubmissions = [];
let allProfilesCache = [];
let activeResetUserEmail = null;

/**
 * Función centralizada para llamadas a la API de Google Apps Script.
 * Utiliza FormData y redirect: "follow" para resolver de raíz el manejo de la redirección 302 y evitar CORS preflight.
 */
async function callApi(action, data = {}) {
  try {
    const params = new URLSearchParams();
    params.append('action', action);
    params.append('data', JSON.stringify(data));

    const response = await fetch(API_URL, {
      method: "POST",
      // Enviar como formulario estándar evita que el navegador active el bloqueo CORS
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    });

    const text = await response.text();
    return JSON.parse(text);
  } catch (error) {
    console.error("Error al conectar con Apps Script:", error);
    return { success: false, message: "Error de conexión con el servidor Google." };
  }
}


/**
 * Convierte un archivo local a cadena Base64 mediante FileReader.
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Tomar solo la parte posterior a la coma (datos Base64 puros)
      const rawBase64 = reader.result.includes(',')
        ? reader.result.split(',')[1]
        : reader.result;
      resolve(rawBase64);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}
async function handleSendCode(e) {
  e.preventDefault();
  const accountInput = document.getElementById('resetAccountInput').value.trim().toLowerCase();
  if (!accountInput) return;

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Enviando...`;
  }

  try {
    const res = await callApi('sendRecoveryEmail', { email: accountInput });

    if (res && res.success) {
      activeResetUserEmail = res.email || accountInput;
      const code = res.code || res.recoveryCode;
      if (code) {
        window.recoveryTokenCode = String(code).trim();
        window.generatedRecoveryCode = String(code).trim();
      }

      const targetDisplay = document.getElementById('targetEmailDisplay');
      if (targetDisplay) targetDisplay.textContent = res.email || accountInput;

      // Ocultar formulario de envío de correo y mostrar sección de verificación de código
      document.getElementById('sendCodeForm')?.classList.add('hidden');
      document.getElementById('codeSection')?.classList.remove('hidden');
      document.getElementById('codeNotification')?.classList.remove('hidden');
      
      const verifyForm = document.getElementById('verifyCodeForm');
      if (verifyForm) {
        verifyForm.classList.remove('hidden');
        const codeInput = document.getElementById('inputVerificationCode');
        if (codeInput) {
          codeInput.disabled = false;
          codeInput.value = '';
          codeInput.focus();
        }
        document.getElementById('btnValidateCode')?.classList.remove('hidden');
      }

      document.getElementById('newPasswordForm')?.classList.add('hidden');

      alert(`📩 Se ha enviado un código de 6 dígitos a: ${res.email || accountInput}. Por favor revisa tu bandeja de entrada o spam.`);
    } else {
      alert('❌ ' + (res?.message || 'Error al enviar el código de recuperación.'));
    }
  } catch (err) {
    console.error("Error al enviar correo de recuperación:", err);
    alert('❌ Ocurrió un error al contactar al servidor.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  }
}
/**
 * Inicialización de la sesión del usuario al cargar la página.
 * Persiste la sesión en localStorage ('academic_user').
 */
async function initSession() {
  const savedUser = localStorage.getItem('academic_user');
  if (savedUser) {
    try {
      currentProfile = JSON.parse(savedUser);
      if (currentProfile && !currentProfile.id) {
        currentProfile.id = currentProfile.email || currentProfile.username;
      }
    } catch (e) {
      console.error("Error al parsear el usuario almacenado en localStorage:", e);
      currentProfile = null;
      localStorage.removeItem('academic_user');
    }
  } else {
    currentProfile = null;
  }

  await fetchDeadline();
  await renderApp();
}

/**
 * Consulta la lista de perfiles/usuarios registrados en el sistema.
 */
async function fetchProfiles() {
  try {
    const res = await callApi('getProfiles');
    if (res && res.success) {
      allProfilesCache = Array.isArray(res.data) ? res.data : (Array.isArray(res.profiles) ? res.profiles : (Array.isArray(res) ? res : []));
    } else if (Array.isArray(res)) {
      allProfilesCache = res;
    } else {
      allProfilesCache = [];
    }
  } catch (err) {
    console.error("Error al obtener perfiles:", err);
    allProfilesCache = [];
  }
  return allProfilesCache;
}

/**
 * Consulta el plazo oficial global de entrega configurado en Google Sheets.
 */
async function fetchDeadline() {
  try {
    const res = await callApi('getDeadline');
    let val = null;
    if (res && res.success) {
      val = res.deadline || (res.data && (res.data.official_deadline || res.data.deadline || res.data)) || res.official_deadline || null;
    } else if (res && (res.deadline || res.official_deadline)) {
      val = res.deadline || res.official_deadline;
    }
    if (val === 'official_deadline' || val === 'setting_value' || val === '') {
      val = null;
    }
    currentDeadline = val;
  } catch (err) {
    console.error("Error al obtener plazo oficial:", err);
  }
}

/**
 * Cierre de sesión: limpia el almacenamiento local y restablece la interfaz.
 */
function logout() {
  localStorage.removeItem('academic_user');
  currentProfile = null;
  activeResetUserEmail = null;
  document.querySelectorAll('form').forEach(f => f.reset());
  document.getElementById('sendCodeForm')?.classList.remove('hidden');
  document.getElementById('codeSection')?.classList.add('hidden');
  document.getElementById('codeNotification')?.classList.add('hidden');
  document.getElementById('verifyCodeForm')?.classList.add('hidden');
  document.getElementById('newPasswordForm')?.classList.add('hidden');
  const codeInput = document.getElementById('inputVerificationCode');
  if (codeInput) { codeInput.disabled = false; codeInput.value = ''; }
  document.getElementById('btnValidateCode')?.classList.remove('hidden');
  switchAuthTab('login');
  renderApp();
}

/**
 * Alterna entre pestañas del formulario de autenticación (Login, Registro, Recuperación).
 */
function switchAuthTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const forgotContainer = document.getElementById('forgotFormContainer');
  const authTabs = document.getElementById('authTabs');

  document.querySelectorAll('form').forEach(f => f.reset());
  document.getElementById('sendCodeForm')?.classList.remove('hidden');
  document.getElementById('codeSection')?.classList.add('hidden');
  document.getElementById('codeNotification')?.classList.add('hidden');
  document.getElementById('verifyCodeForm')?.classList.add('hidden');
  document.getElementById('newPasswordForm')?.classList.add('hidden');
  const codeInput = document.getElementById('inputVerificationCode');
  if (codeInput) { codeInput.disabled = false; codeInput.value = ''; }
  document.getElementById('btnValidateCode')?.classList.remove('hidden');

  if (tab === 'login') {
    authTabs.classList.remove('hidden');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    forgotContainer.classList.add('hidden');
    document.getElementById('tabLogin').className = "w-1/2 py-2.5 border-b-2 border-green-700 text-green-800 font-extrabold focus:outline-none";
    document.getElementById('tabRegister').className = "w-1/2 py-2.5 border-b-2 border-transparent text-gray-500 hover:text-green-700 font-bold focus:outline-none";
  } else if (tab === 'register') {
    authTabs.classList.remove('hidden');
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    forgotContainer.classList.add('hidden');
    document.getElementById('tabRegister').className = "w-1/2 py-2.5 border-b-2 border-green-700 text-green-800 font-extrabold focus:outline-none";
    document.getElementById('tabLogin').className = "w-1/2 py-2.5 border-b-2 border-transparent text-gray-500 hover:text-green-700 font-bold focus:outline-none";
  } else if (tab === 'forgot') {
    authTabs.classList.add('hidden');
    loginForm.classList.add('hidden');
    registerForm.classList.add('hidden');
    forgotContainer.classList.remove('hidden');
  }
}

/**
 * Valida si la entrega actual está dentro del plazo oficial definido.
 */
function checkIsOnTime() {
  if (!currentDeadline) return true;
  const deadlineDate = new Date(currentDeadline);
  if (isNaN(deadlineDate.getTime())) return true;
  return new Date() <= deadlineDate;
}

/**
 * Actualiza el plazo oficial de entrega en Google Sheets (Rol Coordinador).
 */
async function setDeadline(e) {
  e.preventDefault();
  const deadlineInput = document.getElementById('deadlineInput');
  const newDeadline = deadlineInput.value;
  if (!newDeadline) return;

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Guardando...`;
  }

  try {
    const res = await callApi('setDeadline', { deadline: newDeadline });
    if (res && res.success) {
      currentDeadline = newDeadline;
      alert('✅ Plazo oficial actualizado correctamente.');
      await renderApp();
    } else {
      alert('❌ Error al actualizar el límite: ' + (res?.message || 'Error en el servidor Google.'));
    }
  } catch (error) {
    console.error("Error al actualizar deadline:", error);
    alert('❌ Ocurrió un error inesperado al actualizar el plazo.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  }
}

/**
 * Maneja el registro de nuevos usuarios en Google Sheets.
 */
async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const username = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;
  const role = document.getElementById('regRole').value;

  if (password.length < 6) {
    alert('❌ La contraseña debe tener al menos 6 caracteres.');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Registrando...`;
  }

  try {
    const res = await callApi('register', { name, username, email, password, role });
    if (res && res.success) {
      alert('✅ ¡Registro exitoso! Por favor inicia sesión con tu usuario o correo y contraseña.');
      document.getElementById('registerForm').reset();
      switchAuthTab('login');
    } else {
      alert('❌ Error al registrar la cuenta: ' + (res?.message || 'No se pudo completar el registro.'));
    }
  } catch (err) {
    console.error("Error en handleRegister:", err);
    alert('❌ Error inesperado durante el registro.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  }
}

/**
 * Maneja el inicio de sesión contra Google Apps Script y guarda el perfil en localStorage.
 */
async function handleLogin(e) {
  e.preventDefault();
  const loginVal = document.getElementById('loginUser').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Verificando...`;
  }

  try {
    const res = await callApi('login', { loginInput: loginVal, password });
    if (res && res.success && (res.user || res.profile || res.data)) {
      const user = res.user || res.profile || res.data;
      if (!user.id) {
        user.id = user.email || user.username || 'user_' + Date.now();
      }
      currentProfile = user;
      localStorage.setItem('academic_user', JSON.stringify(user));
      document.getElementById('loginForm').reset();
      await renderApp();
    } else {
      alert('❌ Credenciales incorrectas: ' + (res?.message || 'Usuario o contraseña inválidos.'));
    }
  } catch (err) {
    console.error("Error en handleLogin:", err);
    alert('❌ Error de comunicación con el servicio de autenticación.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  }
}

/**
 * Cancela la verificación del código y permite ingresar un correo diferente.
 */
function cancelVerifyCode() {
  document.getElementById('codeSection')?.classList.add('hidden');
  document.getElementById('verifyCodeForm')?.classList.add('hidden');
  document.getElementById('codeNotification')?.classList.add('hidden');
  document.getElementById('newPasswordForm')?.classList.add('hidden');
  document.getElementById('sendCodeForm')?.classList.remove('hidden');
  document.getElementById('resetAccountInput')?.focus();
}

/**
 * Valida que el código de 6 dígitos ingresado coincida.
 * Si coincide, oculta COMPLETAMENTE todo lo relacionado al código y muestra solo la creación de contraseña.
 */
function handleVerifyCode(e) {
  e.preventDefault();
  const codeInput = document.getElementById('inputVerificationCode');
  const inputCode = codeInput ? codeInput.value.trim() : '';
  const expectedCode = window.generatedRecoveryCode || window.recoveryTokenCode;

  if (!expectedCode) {
    alert('❌ No se ha generado ningún código o la sesión de recuperación expiró. Solicita un nuevo código.');
    return;
  }

  if (!inputCode || inputCode.length !== 6) {
    alert('❌ Por favor ingresa el código completo de 6 dígitos.');
    codeInput?.focus();
    return;
  }

  if (inputCode !== expectedCode) {
    alert('❌ El código de 6 dígitos ingresado es incorrecto. Por favor verifica tu correo.');
    codeInput?.focus();
    return;
  }

  // Código verificado: Ocultar al 100% todo rastro del código y formularios anteriores
  document.getElementById('sendCodeForm')?.classList.add('hidden');
  document.getElementById('codeSection')?.classList.add('hidden');
  document.getElementById('codeNotification')?.classList.add('hidden');
  document.getElementById('verifyCodeForm')?.classList.add('hidden');

  // Mostrar únicamente el formulario para crear nueva contraseña
  const newPassForm = document.getElementById('newPasswordForm');
  if (newPassForm) {
    newPassForm.classList.remove('hidden');
    document.getElementById('inputNewPassword')?.focus();
  }

  alert('✅ ¡Código verificado correctamente! Ahora ingresa tu nueva contraseña.');
}

/**
 * Envía la nueva contraseña a Google Apps Script para actualizar la cuenta.
 */
async function handleResetPassword(e) {
  e.preventDefault();
  const newPassword = document.getElementById('inputNewPassword').value;
  const confirmPassword = document.getElementById('inputConfirmPassword')?.value;

  if (confirmPassword !== undefined && confirmPassword !== '' && newPassword !== confirmPassword) {
    alert('❌ Las contraseñas no coinciden. Por favor verifícalas.');
    return;
  }

  if (newPassword.length < 6) {
    alert('❌ La nueva contraseña debe tener mínimo 6 caracteres.');
    return;
  }

  if (!activeResetUserEmail) {
    alert('❌ No hay ningún usuario activo para restablecer contraseña.');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Guardando...`;
  }

  try {
    const res = await callApi('resetPassword', {
      email: activeResetUserEmail,
      newPassword: newPassword
    });

    if (res && res.success) {
      alert('✅ ¡Contraseña restablecida con éxito! Ya puedes iniciar sesión con tu nueva clave.');
      document.getElementById('inputNewPassword').value = '';
      if (document.getElementById('inputConfirmPassword')) {
        document.getElementById('inputConfirmPassword').value = '';
      }
      const codeInput = document.getElementById('inputVerificationCode');
      if (codeInput) {
        codeInput.value = '';
        codeInput.disabled = false;
      }
      activeResetUserEmail = null;
      window.recoveryTokenCode = null;
      window.generatedRecoveryCode = null;
      logout();
    } else {
      alert('❌ Error: ' + (res?.message || 'No se pudo actualizar la contraseña.'));
    }
  } catch (err) {
    console.error("Error en handleResetPassword:", err);
    alert('❌ Error de conexión al restablecer la contraseña.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  }
}
/**
 * Sube una entrega de documento a Google Drive y registra sus metadatos en Google Sheets.
 */
async function submitSubmission(e) {
  e.preventDefault();
  if (!currentProfile) return;

  const title = document.getElementById('subTitle').value.trim();
  const target = document.getElementById('subTarget').value;
  const notes = document.getElementById('subNotes').value.trim();
  const fileInput = document.getElementById('subFile');
  const fileObj = fileInput.files ? fileInput.files[0] : null;
  const isOnTime = checkIsOnTime();

  if (!fileObj) {
    alert('❌ Por favor selecciona un documento para adjuntar.');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up fa-spin text-white mr-1"></i> Subiendo a Google Drive...`;
  }

  try {
    const fileBase64 = await readFileAsBase64(fileObj);

    const submissionPayload = {
      student_id: currentProfile.id,
      title: title,
      target_role: target,
      notes: notes,
      fileName: fileObj.name,
      fileBase64: fileBase64,
      is_on_time: isOnTime
    };

    const res = await callApi('createSubmission', submissionPayload);

    if (res && res.success) {
      alert('✅ Documento enviado y guardado correctamente en Google Drive.');
      document.getElementById('subTitle').value = '';
      document.getElementById('subNotes').value = '';
      fileInput.value = '';
      await renderApp();
    } else {
      alert('❌ Error al guardar la entrega: ' + (res?.message || 'No se pudo procesar la entrega en Google.'));
    }
  } catch (err) {
    console.error('Error al procesar el archivo de entrega:', err);
    alert('❌ Ocurrió un error al leer o subir el archivo.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    }
  }
}

/**
 * Consulta todas las entregas desde Google Sheets y las enriquece con datos del estudiante.
 */
async function fetchSubmissions() {
  try {
    const res = await callApi('getSubmissions');
    let subs = [];
    if (res && res.success) {
      subs = Array.isArray(res.data) ? res.data : (Array.isArray(res.submissions) ? res.submissions : []);
    } else if (Array.isArray(res)) {
      subs = res;
    }

    if (allProfilesCache.length === 0) {
      await fetchProfiles();
    }

    return subs.map(sub => {
      let studentName = sub.profiles?.name || sub.student_name || sub.studentName || '';
      let studentEmail = sub.profiles?.email || sub.student_email || sub.studentEmail || '';

      if (!studentName && allProfilesCache.length > 0) {
        const studentProfile = allProfilesCache.find(p => String(p.id) === String(sub.student_id) || String(p.email) === String(sub.student_id));
        if (studentProfile) {
          studentName = studentProfile.name;
          studentEmail = studentProfile.email;
        }
      }

      return {
        ...sub,
        id: sub.id || sub.submission_id || sub._id,
        title: sub.title || 'Entrega de Proyecto',
        target_role: (sub.target_role || sub.targetRole || 'director').toLowerCase(),
        profiles: {
          name: studentName || 'Estudiante',
          email: studentEmail || ''
        },
        file_url: sub.file_url || sub.fileUrl || sub.drive_url || sub.driveUrl || '#',
        file_name: sub.file_name || sub.fileName || 'archivo_adjunto',
        is_on_time: typeof sub.is_on_time === 'boolean' ? sub.is_on_time : (String(sub.is_on_time).toLowerCase() === 'true' || sub.is_on_time === 1),
        status: sub.status || 'Pendiente de Revisión',
        created_at: sub.created_at || sub.date || sub.timestamp || new Date().toISOString()
      };
    });
  } catch (error) {
    console.error('Error al obtener entregas:', error);
    return [];
  }
}

/**
 * Consulta los dictámenes/feedbacks emitidos desde Google Sheets.
 */
async function fetchFeedbacks() {
  try {
    const res = await callApi('getFeedbacks');
    let feedbacks = [];
    if (res && res.success) {
      feedbacks = Array.isArray(res.data) ? res.data : (Array.isArray(res.feedbacks) ? res.feedbacks : []);
    } else if (Array.isArray(res)) {
      feedbacks = res;
    }

    if (allProfilesCache.length === 0) {
      await fetchProfiles();
    }

    return feedbacks.map(fb => {
      let reviewerName = fb.profiles?.name || fb.reviewer_name || fb.reviewerName || '';
      if (!reviewerName && allProfilesCache.length > 0) {
        const revProfile = allProfilesCache.find(p => String(p.id) === String(fb.reviewer_id) || String(p.email) === String(fb.reviewer_id));
        if (revProfile) {
          reviewerName = revProfile.name;
        }
      }

      return {
        ...fb,
        submission_id: fb.submission_id || fb.subId || fb.submissionId,
        profiles: {
          name: reviewerName || fb.reviewer_role || 'Evaluador',
          role: fb.reviewer_role || 'Revisor'
        },
        reviewer_role: fb.reviewer_role || fb.reviewerRole || 'Revisor',
        grade: fb.grade !== undefined && fb.grade !== null && fb.grade !== '' ? parseFloat(fb.grade).toFixed(1) : null,
        comment: fb.comment || fb.notes || 'Sin comentarios adicionales.',
        attachment_url: fb.attachment_url || fb.attachmentUrl || fb.file_url || fb.drive_url || fb.driveUrl || '',
        attachment_name: fb.attachment_name || fb.attachmentName || fb.file_name || fb.fileName || ''
      };
    });
  } catch (error) {
    console.error('Error al obtener feedbacks:', error);
    return [];
  }
}

/**
 * Abre el formulario modal/desplegable para emitir valoración de una entrega específica.
 */
function openFeedbackForm(subId) {
  if (!currentProfile) return;
  const sub = allSubmissions.find(s => String(s.id) === String(subId));
  if (!sub) return;

  document.getElementById('feedbackSubId').value = sub.id;
  document.getElementById('feedbackTargetTitle').textContent = `${sub.title} (${sub.profiles?.name || 'Estudiante'})`;

  const decisionSelect = document.getElementById('feedbackDecision');
  const gradeContainer = document.getElementById('gradeFieldContainer');

  if (currentProfile.role === 'director') {
    gradeContainer.classList.add('hidden');
    document.getElementById('feedbackGrade').required = false;
    decisionSelect.innerHTML = `
      <option value="Aprobado para Envío a Jurados">Aprobado para Envío a Jurados</option>
      <option value="Requiere Ajustes Metodológicos">Requiere Ajustes Metodológicos</option>
      <option value="Rechazado por el Director">Rechazado por el Director</option>
    `;
  } else if (currentProfile.role === 'jurado') {
    gradeContainer.classList.remove('hidden');
    document.getElementById('feedbackGrade').required = true;
    decisionSelect.innerHTML = `
      <option value="Aprobado Sobresaliente">Aprobado Sobresaliente</option>
      <option value="Aprobado">Aprobado</option>
      <option value="Aprobado con Condiciones">Aprobado con Condiciones</option>
      <option value="Reprobado">Reprobado</option>
    `;
  }

  document.getElementById('feedbackFormContainer').classList.remove('hidden');
}

/**
 * Cierra el formulario de valoración.
 */
function closeFeedbackForm() {
  document.getElementById('feedbackFormContainer').classList.add('hidden');
}

/**
 * Envía la valoración (dictamen y archivo adjunto) a Google Apps Script / Drive.
 */
async function submitFeedback(e) {
  e.preventDefault();
  if (!currentProfile) return;

  const subId = document.getElementById('feedbackSubId').value;
  const decision = document.getElementById('feedbackDecision').value;
  const gradeInput = document.getElementById('feedbackGrade').value;
  const feedbackText = document.getElementById('feedbackText').value;
  const fileInput = document.getElementById('feedbackFile');
  const fileObj = fileInput.files ? fileInput.files[0] : null;

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Guardando dictamen...`;
  }

  try {
    let fileBase64 = null;
    let fileName = null;

    if (fileObj) {
      fileBase64 = await readFileAsBase64(fileObj);
      fileName = fileObj.name;
    }

    const payload = {
      submission_id: subId,
      reviewer_id: currentProfile.id,
      reviewer_role: currentProfile.role,
      reviewer_name: currentProfile.name,
      decision: decision,
      grade: currentProfile.role === 'jurado' && gradeInput ? parseFloat(gradeInput).toFixed(1) : null,
      comment: feedbackText,
      fileName: fileName,
      fileBase64: fileBase64
    };

    const res = await callApi('createFeedback', payload);

    if (res && res.success) {
      alert('✅ Valoración guardada y registrada en el historial.');
      closeFeedbackForm();
      fileInput.value = '';
      document.getElementById('feedbackText').value = '';
      if (document.getElementById('feedbackGrade')) document.getElementById('feedbackGrade').value = '';
      await renderApp();
    } else {
      alert('❌ Error guardando feedback: ' + (res?.message || 'Error en el servidor Google.'));
    }
  } catch (err) {
    console.error('Error al procesar feedback:', err);
    alert('❌ Ocurrió un error al enviar la valoración.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    }
  }
}

/**
 * Renderiza la interfaz principal según el estado de la sesión y el rol del usuario.
 */
async function renderApp() {
  const hasValidDate = currentDeadline && currentDeadline !== 'official_deadline' && !isNaN(new Date(currentDeadline).getTime());
  const displayDate = hasValidDate
    ? new Date(currentDeadline).toLocaleString('es-CO')
    : (currentDeadline && currentDeadline !== 'official_deadline' ? currentDeadline : "Sin definir");
  document.getElementById('deadlineDisplay').textContent = displayDate;

  if (!currentProfile) {
    document.getElementById('authSection').classList.remove('hidden');
    document.getElementById('appSection').classList.add('hidden');
    document.getElementById('sessionArea').innerHTML = `<span class="text-white font-bold"><i class="fa-solid fa-user-slash mr-1"></i> No autenticado</span>`;
    document.getElementById('roleBadge').innerHTML = `<i class="fa-solid fa-circle-user text-yellow-400"></i> Estado: No autenticado`;
    return;
  }

  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('appSection').classList.remove('hidden');

  const roleNames = {
    'estudiante': 'Estudiante (Autor de Proyecto)',
    'director': 'Director',
    'jurado': 'Jurado',
    'coordinador': 'Coordinador de Énfasis'
  };

  document.getElementById('sessionArea').innerHTML = `
    <span class="font-bold text-white flex items-center gap-1.5">
      <i class="fa-solid fa-circle-user text-yellow-300 text-sm"></i> ${currentProfile.name} 
      <span class="text-green-200 text-[11px] font-normal">(${currentProfile.username || currentProfile.email})</span>
    </span>
    <button onclick="logout()" class="bg-red-600 hover:bg-red-700 active:scale-95 px-3 py-1 rounded-xl text-white font-bold transition shadow-sm ml-2 flex items-center gap-1">
      <i class="fa-solid fa-power-off text-[10px]"></i> Salir
    </button>
  `;

  document.getElementById('roleBadge').innerHTML = `<i class="fa-solid fa-user-check text-green-300"></i> Rol Activo: ${roleNames[currentProfile.role] || currentProfile.role}`;
  document.querySelectorAll('.role-panel').forEach(p => p.classList.add('hidden'));

  // Carga asíncrona de entregas y valoraciones
  allSubmissions = await fetchSubmissions();
  const allFeedbacks = await fetchFeedbacks();

  if (currentProfile.role === 'estudiante') {
    document.getElementById('panel-estudiante').classList.remove('hidden');
    const isOnTime = checkIsOnTime();
    document.getElementById('studentDeadlineAlert').className = `mb-4 p-3.5 rounded-xl text-xs border font-bold ${isOnTime ? 'bg-green-100 border-green-300 text-green-900' : 'bg-red-100 border-red-300 text-red-900'}`;
    document.getElementById('studentDeadlineAlert').innerHTML = isOnTime ?
      `<i class="fa-solid fa-circle-check mr-1.5 text-green-700"></i> Plazo activo para el registro de entregas.` :
      `<i class="fa-solid fa-triangle-exclamation mr-1.5 text-red-700"></i> El plazo límite expiró. Tus envíos quedarán registrados automáticamente como tardíos.`;
  } else if (currentProfile.role === 'director' || currentProfile.role === 'jurado') {
    document.getElementById('panel-revisor').classList.remove('hidden');
    if (currentProfile.role === 'director') {
      document.getElementById('revisorTitle').innerHTML = `<i class="fa-solid fa-user-check text-green-700 mr-2"></i> Panel de Orientación (Director)`;
      document.getElementById('revisorSubtitle').textContent = "Revise los avances de sus estudiantes orientados y emita el aval metodológico para paso a jurados.";
    } else {
      document.getElementById('revisorTitle').innerHTML = `<i class="fa-solid fa-gavel text-green-700 mr-2"></i> Panel de Evaluación y Calificación (Jurado)`;
      document.getElementById('revisorSubtitle').textContent = "Evalúe los trabajos finales asignados, asigne la nota cuantitativa (0.0 - 5.0) y emita el dictamen final.";
    }
    renderRevisorSubmissions(currentProfile.role, allFeedbacks);
  } else if (currentProfile.role === 'coordinador') {
    document.getElementById('panel-coordinador').classList.remove('hidden');
    if (currentDeadline) {
      const deadlineField = document.getElementById('deadlineInput');
      if (deadlineField && !deadlineField.value && !isNaN(new Date(currentDeadline).getTime())) {
        try {
          const d = new Date(currentDeadline);
          const tzOffset = d.getTimezoneOffset() * 60000;
          deadlineField.value = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
        } catch (e) {
          // Si el formato no coincide, se deja para selección manual
        }
      }
    }
    await renderUserTable();
  }

  renderHistoryTable(allSubmissions, allFeedbacks);
}

/**
 * Renderiza la tabla de documentos asignados al revisor (Director o Jurado).
 */
function renderRevisorSubmissions(role, feedbacks) {
  const subs = allSubmissions.filter(s => (s.target_role || '').toLowerCase() === role.toLowerCase());
  const tableBody = document.getElementById('revisorSubmissionsTable');

  if (subs.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-gray-500 font-bold">No hay documentos asignados a su rol en este momento.</td></tr>`;
    return;
  }

  tableBody.innerHTML = subs.map(s => {
    const fb = feedbacks.find(f => String(f.submission_id) === String(s.id));
    const createdDate = s.created_at && !isNaN(new Date(s.created_at).getTime())
      ? new Date(s.created_at).toLocaleString('es-CO')
      : (s.created_at || '—');

    return `
      <tr class="hover:bg-gray-50 transition">
        <td class="py-3 px-4">${createdDate}</td>
        <td class="py-3 px-4 font-bold text-gray-900">${s.profiles?.name || 'Estudiante Desconocido'}</td>
        <td class="py-3 px-4">
          <p class="font-bold text-gray-900">${s.title}</p>
          <a href="${s.file_url || '#'}" target="_blank" rel="noopener noreferrer" download="${s.file_name}" class="text-[11px] font-mono text-green-700 hover:underline inline-flex items-center gap-1 font-bold">
            <i class="fa-solid fa-paperclip"></i> ${s.file_name} <i class="fa-solid fa-external-link-alt text-[9px] ml-0.5"></i>
          </a>
          ${s.notes ? `<p class="text-[11px] text-gray-500 mt-1 italic">${s.notes}</p>` : ''}
        </td>
        <td class="py-3 px-4">
          <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${s.is_on_time ? 'bg-green-100 text-green-900 border border-green-300' : 'bg-red-100 text-red-900 border border-red-300'}">
            ${s.is_on_time ? 'A Tiempo' : 'Tardía'}
          </span>
        </td>
        <td class="py-3 px-4">
          <p class="font-bold text-xs text-gray-900">${s.status}</p>
          ${fb && fb.grade ? `<span class="text-xs font-bold text-green-700">Nota: ${fb.grade}</span>` : ''}
        </td>
        <td class="py-3 px-4 text-right">
          <button onclick="openFeedbackForm('${s.id}')" class="btn-green font-bold text-[11px] px-3 py-1.5 rounded-lg shadow-sm">
            <i class="fa-solid fa-pen-to-square mr-1 text-white"></i> ${role === 'director' ? 'Revisar / Avalar' : 'Evaluar y Calificar'}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Renderiza la tabla completa del historial general y libro de calificaciones.
 */
function renderHistoryTable(subs, feedbacks) {
  const tableBody = document.getElementById('historyTable');

  if (subs.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-gray-500 font-bold">No hay registros en el historial.</td></tr>`;
    return;
  }

  tableBody.innerHTML = subs.map(s => {
    const feedback = feedbacks.find(f => String(f.submission_id) === String(s.id));
    const createdDate = s.created_at && !isNaN(new Date(s.created_at).getTime())
      ? new Date(s.created_at).toLocaleString('es-CO')
      : (s.created_at || '—');

    return `
      <tr class="hover:bg-gray-50 transition">
        <td class="py-3 px-4">${createdDate}</td>
        <td class="py-3 px-4 font-bold text-gray-900">${s.profiles?.name || 'Desconocido'}</td>
        <td class="py-3 px-4 capitalize"><span class="bg-gray-200 text-gray-900 px-2 py-0.5 rounded border text-[11px] font-bold">${s.target_role}</span></td>
        <td class="py-3 px-4">
          <p class="font-bold text-gray-900">${s.title}</p>
          <a href="${s.file_url || '#'}" target="_blank" rel="noopener noreferrer" download="${s.file_name}" class="text-[11px] font-mono text-green-700 hover:underline inline-flex items-center gap-1 font-bold">
            <i class="fa-solid fa-paperclip"></i> ${s.file_name} <i class="fa-solid fa-external-link-alt text-[9px]"></i>
          </a>
        </td>
        <td class="py-3 px-4">
          <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${s.is_on_time ? 'bg-green-100 text-green-900 border border-green-300' : 'bg-red-100 text-red-900 border border-red-300'}">
            ${s.is_on_time ? 'A Tiempo' : 'Tardía'}
          </span>
        </td>
        <td class="py-3 px-4 font-bold text-sm ${feedback && feedback.grade >= 3.5 ? 'text-green-700' : 'text-red-600'}">
          ${feedback && feedback.grade ? feedback.grade : '—'}
        </td>
        <td class="py-3 px-4">
          <span class="font-bold text-xs text-gray-900">${s.status}</span>
          ${feedback ? `
            <div class="bg-green-50 p-2.5 rounded-xl border border-green-300 mt-1.5 shadow-sm text-xs">
              <p class="font-bold text-green-900">${feedback.profiles?.name || feedback.reviewer_role} (${feedback.reviewer_role}):</p>
              <p class="text-gray-800 mt-0.5">${feedback.comment}</p>
              ${feedback.attachment_name ? `
                <a href="${feedback.attachment_url || '#'}" target="_blank" rel="noopener noreferrer" download="${feedback.attachment_name}" class="mt-1 text-[11px] font-mono text-green-900 hover:underline inline-flex items-center gap-1 font-bold">
                  <i class="fa-solid fa-file-export"></i> Adjunto: ${feedback.attachment_name}
                </a>` : ''}
            </div>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Renderiza el directorio de usuarios y roles registrados para el Coordinador.
 */
async function renderUserTable() {
  const users = await fetchProfiles();
  const tableBody = document.getElementById('registeredUsersTable');
  if (!tableBody) return;

  if (!users || users.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-gray-500 font-bold">No hay usuarios registrados en el sistema.</td></tr>`;
    return;
  }

  tableBody.innerHTML = users.map(u => `
    <tr class="hover:bg-gray-50 transition">
      <td class="py-2.5 px-4 font-bold text-gray-900">${u.name || '—'}</td>
      <td class="py-2.5 px-4 font-mono text-green-800 font-bold">${u.username || '—'}</td>
      <td class="py-2.5 px-4">${u.email || '—'}</td>
      <td class="py-2.5 px-4 capitalize"><span class="bg-gray-200 text-gray-900 px-2 py-0.5 rounded border text-[11px] font-bold">${u.role || '—'}</span></td>
    </tr>
  `).join('');
}

// Inicia el sistema cuando el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', initSession);
