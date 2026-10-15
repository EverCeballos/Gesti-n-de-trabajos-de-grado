const SUPABASE_URL = 'https://jhnwdscrkzcxpngaqthu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_K3wPSb4Yo9C9-uYYlZZrRg_rgdy_oid';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentProfile = null;
let currentDeadline = null;
let allSubmissions = [];
let activeResetUserEmail = null;

// Detectar si el usuario llega mediante el enlace de recuperación de contraseña
supabaseClient.auth.onAuthStateChange(async (event, session) => {
  // Se activa con el evento nativo o inspeccionando la URL directamente
  if (event === 'PASSWORD_RECOVERY' || window.location.hash.includes('type=recovery')) {
    
    // 1. Mostrar la sección de autenticación y ocultar el resto de la app
    document.getElementById('authSection')?.classList.remove('hidden');
    document.getElementById('appSection')?.classList.add('hidden');
    
    // 2. Activar la vista de recuperación (olvidé mi contraseña)
    switchAuthTab('forgot');

    // 3. Ocultar el formulario que solicita el correo y los avisos previos
    document.getElementById('sendCodeForm')?.classList.add('hidden');
    document.getElementById('codeNotification')?.classList.add('hidden');

    // 4. Mostrar únicamente el formulario de la nueva contraseña
    const verifyForm = document.getElementById('verifyCodeForm');
    if (verifyForm) {
      verifyForm.classList.remove('hidden');

      // Ocultar el campo del código de 6 dígitos (no se necesita porque el link ya autenticó)
      const codeInput = document.getElementById('inputVerificationCode');
      if (codeInput) {
        codeInput.parentElement.classList.add('hidden');
        codeInput.required = false;
      }

      // Limpiar y enfocar el campo de la nueva clave
      const newPassInput = document.getElementById('inputNewPassword');
      if (newPassInput) {
        newPassInput.value = '';
        newPassInput.focus();
      }
    }
  }
});


// INIT SESSION
async function initSession() {
  if (window.location.hash.includes('type=recovery')) {
    // Si estamos en recuperación, detenemos el flujo principal
    // para no sobreescribir la interfaz gráfica.
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    await fetchUserProfile(session.user.id);
  } else {
    currentProfile = null;
  }
  await fetchDeadline();
  await renderApp();
}

async function fetchUserProfile(userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) {
    console.error("Error fetching profile:", error);
    currentProfile = null;
  } else {
    currentProfile = data;
  }
}

async function fetchDeadline() {
  const { data, error } = await supabaseClient
    .from('system_settings')
    .select('official_deadline')
    .single(); // Asumimos que hay una sola fila para la configuración global
  
  if (!error && data) {
    currentDeadline = data.official_deadline;
  }
}

async function logout() {
  await supabaseClient.auth.signOut();
  currentProfile = null;
  document.querySelectorAll('form').forEach(f => f.reset());
  document.getElementById('codeNotification')?.classList.add('hidden');
  document.getElementById('verifyCodeForm')?.classList.add('hidden');
  switchAuthTab('login');
  renderApp();
}

function switchAuthTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const forgotContainer = document.getElementById('forgotFormContainer');
  const authTabs = document.getElementById('authTabs');

  document.querySelectorAll('form').forEach(f => f.reset());
  document.getElementById('codeNotification')?.classList.add('hidden');
  document.getElementById('verifyCodeForm')?.classList.add('hidden');

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

function checkIsOnTime() {
  if (!currentDeadline) return true;
  return new Date() <= new Date(currentDeadline);
}

async function setDeadline(e) {
  e.preventDefault();
  const newDeadline = document.getElementById('deadlineInput').value;
  
  // Actualizamos el registro existente (asumimos id = 1 para setting global)
  const { error } = await supabaseClient
    .from('system_settings')
    .update({ official_deadline: newDeadline })
    .eq('id', 1);
    
  if (error) {
    alert('❌ Error al actualizar el límite: ' + error.message);
  } else {
    currentDeadline = newDeadline;
    alert('✅ Plazo oficial actualizado correctamente.');
    renderApp();
  }
}

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

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: name,
        username: username,
        role: role
      }
    }
  });

  if (error) {
    alert('❌ Error al registrar la cuenta: ' + error.message);
    return;
  }

  if (!data.session && data.user) {
    alert('✅ Registro exitoso. Por favor revisa tu correo electrónico (y spam) para confirmar tu cuenta antes de iniciar sesión.');
  } else {
    alert('✅ ¡Registro exitoso! Por favor inicia sesión.');
  }

  document.getElementById('registerForm').reset();
  switchAuthTab('login');
}

async function handleLogin(e) {
  e.preventDefault();
  const loginVal = document.getElementById('loginUser').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;

  let emailToLogin = loginVal;

  if (!loginVal.includes('@')) {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('email')
      .eq('username', loginVal)
      .single();
      
    if (error || !data) {
      alert('❌ Nombre de usuario incorrecto o no encontrado.');
      return;
    }
    emailToLogin = data.email;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: emailToLogin,
    password
  });

  if (error) {
    alert('❌ Credenciales incorrectas: ' + error.message);
  } else {
    await fetchUserProfile(data.user.id);
    if (!currentProfile) {
       alert('❌ Error crítico: Sesión iniciada correctamente, pero no se pudo cargar el perfil. Verifica que la tabla "profiles" exista y que las reglas RLS permitan a los usuarios hacer SELECT de su propio registro.');
    }
    renderApp();
  }
}

async function handleSendCode(e) {
  e.preventDefault();
  const accountInput = document.getElementById('resetAccountInput').value.trim().toLowerCase();
  
  let targetEmail = accountInput;
  if (!accountInput.includes('@')) {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('email')
      .eq('username', accountInput)
      .single();
    if (error || !data) {
      alert('❌ Usuario no encontrado.');
      return;
    }
    targetEmail = data.email;
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(targetEmail, {
    redirectTo: window.location.origin + window.location.pathname
  });

  if (error) {
    alert('❌ Error al solicitar recuperación: ' + error.message);
  } else {
    activeResetUserEmail = targetEmail;
    document.getElementById('targetEmailDisplay').textContent = targetEmail;
    document.getElementById('codeNotification').classList.remove('hidden');
    document.getElementById('verifyCodeForm').classList.remove('hidden');
    alert(`📩 Instrucciones de recuperación enviadas a: ${targetEmail}`);
  }
}

// 2. Guardar la nueva contraseña directamente
async function handleResetPassword(e) {
  e.preventDefault();
  const newPassword = document.getElementById('inputNewPassword').value;

  if (newPassword.length < 6) {
    alert('❌ La nueva contraseña debe tener mínimo 6 caracteres.');
    return;
  }

  // Actualiza la contraseña del usuario autenticado por el enlace
  const { data, error } = await supabaseClient.auth.updateUser({
    password: newPassword
  });

  if (error) {
    alert('❌ Error al actualizar la contraseña: ' + error.message);
  } else {
    alert('✅ ¡Contraseña actualizada exitosamente! Ya puedes iniciar sesión con tu nueva clave.');
    
    // Restaurar el campo por si se vuelve a usar en el futuro
    const codeInput = document.getElementById('inputVerificationCode');
    if (codeInput) {
      codeInput.parentElement.classList.remove('hidden');
      codeInput.required = true;
    }

    // Cerrar la sesión temporal y volver a la vista de login
    await logout();
  }
}

async function submitSubmission(e) {
  e.preventDefault();
  if (!currentProfile) return;

  const title = document.getElementById('subTitle').value;
  const target = document.getElementById('subTarget').value;
  const notes = document.getElementById('subNotes').value;
  const fileInput = document.getElementById('subFile');
  const fileObj = fileInput.files[0];
  const isOnTime = checkIsOnTime();

  let fileUrl = '';
  let fileName = '';

  if (fileObj) {
    const timestamp = Date.now();
    fileName = `${timestamp}_${fileObj.name}`;
    const filePath = `submissions/${fileName}`;
    
    const { error: uploadError } = await supabaseClient.storage
      .from('academic_files')
      .upload(filePath, fileObj);
      
    if (uploadError) {
      alert('❌ Error subiendo archivo: ' + uploadError.message);
      return;
    }

    const { data: publicUrlData } = supabaseClient.storage
      .from('academic_files')
      .getPublicUrl(filePath);
      
    fileUrl = publicUrlData.publicUrl;
  }

  const { error } = await supabaseClient.from('submissions').insert([{
    student_id: currentProfile.id,
    title: title,
    target_role: target,
    file_name: fileObj ? fileObj.name : 'sin_nombre',
    file_url: fileUrl,
    notes: notes,
    is_on_time: isOnTime,
    status: 'Pendiente de Revisión'
  }]);

  if (error) {
    alert('❌ Error al guardar entrega: ' + error.message);
  } else {
    alert('✅ Documento enviado correctamente.');
    document.getElementById('subTitle').value = '';
    document.getElementById('subNotes').value = '';
    fileInput.value = '';
    renderApp();
  }
}

async function fetchSubmissions() {
  const { data, error } = await supabaseClient
    .from('submissions')
    .select(`
      *,
      profiles!student_id(name, email)
    `)
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('Error fetching submissions:', error);
    return [];
  }
  return data || [];
}

async function fetchFeedbacks() {
  const { data, error } = await supabaseClient
    .from('feedbacks')
    .select(`
      *,
      profiles!reviewer_id(name, role)
    `);
  if (error) {
    console.error('Error fetching feedbacks:', error);
    return [];
  }
  return data || [];
}

function openFeedbackForm(subId) {
  if (!currentProfile) return;
  const sub = allSubmissions.find(s => String(s.id) === String(subId));
  if (!sub) return;

  document.getElementById('feedbackSubId').value = sub.id;
  document.getElementById('feedbackTargetTitle').textContent = `${sub.title} (${sub.profiles.name})`;

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

function closeFeedbackForm() {
  document.getElementById('feedbackFormContainer').classList.add('hidden');
}

async function submitFeedback(e) {
  e.preventDefault();
  if (!currentProfile) return;

  const subId = document.getElementById('feedbackSubId').value;
  const decision = document.getElementById('feedbackDecision').value;
  const gradeInput = document.getElementById('feedbackGrade').value;
  const feedbackText = document.getElementById('feedbackText').value;
  const fileInput = document.getElementById('feedbackFile');
  const fileObj = fileInput.files[0];

  let fileUrl = null;
  let fileName = null;

  if (fileObj) {
    const timestamp = Date.now();
    fileName = `${timestamp}_${fileObj.name}`;
    const filePath = `feedback/${fileName}`;
    
    const { error: uploadError } = await supabaseClient.storage
      .from('academic_files')
      .upload(filePath, fileObj);
      
    if (uploadError) {
      alert('❌ Error subiendo archivo: ' + uploadError.message);
      return;
    }
    const { data: publicUrlData } = supabaseClient.storage
      .from('academic_files')
      .getPublicUrl(filePath);
    fileUrl = publicUrlData.publicUrl;
    fileName = fileObj.name;
  }

  const { error: feedbackError } = await supabaseClient.from('feedbacks').insert([{
    submission_id: subId,
    reviewer_id: currentProfile.id,
    reviewer_role: currentProfile.role,
    decision: decision,
    grade: currentProfile.role === 'jurado' && gradeInput ? parseFloat(gradeInput).toFixed(1) : null,
    comment: feedbackText,
    attachment_name: fileName,
    attachment_url: fileUrl
  }]);

  if (feedbackError) {
    alert('❌ Error guardando feedback: ' + feedbackError.message);
    return;
  }

  alert('✅ Valoración guardada y registrada en el historial.');
  closeFeedbackForm();
  renderApp();
}

async function renderApp() {
  document.getElementById('deadlineDisplay').textContent = currentDeadline ? new Date(currentDeadline).toLocaleString('es-CO') : "Sin definir";

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
    <span class="font-bold text-white flex items-center gap-1.5"><i class="fa-solid fa-circle-user text-yellow-300 text-sm"></i> ${currentProfile.name} <span class="text-green-200 text-[11px] font-normal">(${currentProfile.username})</span></span>
    <button onclick="logout()" class="bg-red-600 hover:bg-red-700 active:scale-95 px-3 py-1 rounded-xl text-white font-bold transition shadow-sm ml-2 flex items-center gap-1">
      <i class="fa-solid fa-power-off text-[10px]"></i> Salir
    </button>
  `;

  document.getElementById('roleBadge').innerHTML = `<i class="fa-solid fa-user-check text-green-300"></i> Rol Activo: ${roleNames[currentProfile.role]}`;
  document.querySelectorAll('.role-panel').forEach(p => p.classList.add('hidden'));

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
    await renderUserTable();
  }

  renderHistoryTable(allSubmissions, allFeedbacks);
}

function renderRevisorSubmissions(role, feedbacks) {
  const subs = allSubmissions.filter(s => s.target_role === role);
  const tableBody = document.getElementById('revisorSubmissionsTable');

  if (subs.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-gray-500 font-bold">No hay documentos asignados a su rol en este momento.</td></tr>`;
    return;
  }

  tableBody.innerHTML = subs.map(s => `
    <tr class="hover:bg-gray-50 transition">
      <td class="py-3 px-4">${new Date(s.created_at).toLocaleString('es-CO')}</td>
      <td class="py-3 px-4 font-bold text-gray-900">${s.profiles?.name || 'Estudiante Desconocido'}</td>
      <td class="py-3 px-4">
        <p class="font-bold text-gray-900">${s.title}</p>
        <a href="${s.file_url || '#'}" target="_blank" download="${s.file_name}" class="text-[11px] font-mono text-green-700 hover:underline inline-flex items-center gap-1 font-bold">
          <i class="fa-solid fa-paperclip"></i> ${s.file_name} <i class="fa-solid fa-download text-[9px] ml-0.5"></i>
        </a>
      </td>
      <td class="py-3 px-4">
        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${s.is_on_time ? 'bg-green-100 text-green-900 border border-green-300' : 'bg-red-100 text-red-900 border border-red-300'}">
          ${s.is_on_time ? 'A Tiempo' : 'Tardía'}
        </span>
      </td>
      <td class="py-3 px-4">
        <p class="font-bold text-xs text-gray-900">${s.status}</p>
        ${(() => { const fb = feedbacks.find(f => f.submission_id === s.id); return fb && fb.grade ? `<span class="text-xs font-bold text-green-700">Nota: ${fb.grade}</span>` : ''; })()}
      </td>
      <td class="py-3 px-4 text-right">
        <button onclick="openFeedbackForm('${s.id}')" class="btn-green font-bold text-[11px] px-3 py-1.5 rounded-lg shadow-sm">
          <i class="fa-solid fa-pen-to-square mr-1 text-white"></i> ${role === 'director' ? 'Revisar / Avalar' : 'Evaluar y Calificar'}
        </button>
      </td>
    </tr>
  `).join('');
}

function renderHistoryTable(subs, feedbacks) {
  const tableBody = document.getElementById('historyTable');

  if (subs.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-gray-500 font-bold">No hay registros en el historial.</td></tr>`;
    return;
  }

  tableBody.innerHTML = subs.map(s => {
    const feedback = feedbacks.find(f => f.submission_id === s.id);
    return `
      <tr class="hover:bg-gray-50 transition">
        <td class="py-3 px-4">${new Date(s.created_at).toLocaleString('es-CO')}</td>
        <td class="py-3 px-4 font-bold text-gray-900">${s.profiles?.name || 'Desconocido'}</td>
        <td class="py-3 px-4 capitalize"><span class="bg-gray-200 text-gray-900 px-2 py-0.5 rounded border text-[11px] font-bold">${s.target_role}</span></td>
        <td class="py-3 px-4">
          <p class="font-bold text-gray-900">${s.title}</p>
          <a href="${s.file_url || '#'}" target="_blank" download="${s.file_name}" class="text-[11px] font-mono text-green-700 hover:underline inline-flex items-center gap-1 font-bold">
            <i class="fa-solid fa-paperclip"></i> ${s.file_name} <i class="fa-solid fa-download text-[9px]"></i>
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
              <p class="font-bold text-green-900">${feedback.profiles?.name} (${feedback.reviewer_role}):</p>
              <p class="text-gray-800 mt-0.5">${feedback.comment}</p>${feedback.attachment_name ? `<a href="${feedback.attachment_url || '#'}" target="_blank" download="${feedback.attachment_name}" class="mt-1 text-[11px] font-mono text-green-900 hover:underline inline-flex items-center gap-1 font-bold"><i class="fa-solid fa-file-export"></i> Adjunto: ${feedback.attachment_name}</a>` : ''}
            </div>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

async function renderUserTable() {
  const { data: users, error } = await supabaseClient.from('profiles').select('*');
  if (error || !users) return;

  document.getElementById('registeredUsersTable').innerHTML = users.map(u => `
    <tr class="hover:bg-gray-50 transition">
      <td class="py-2.5 px-4 font-bold text-gray-900">${u.name}</td>
      <td class="py-2.5 px-4 font-mono text-green-800 font-bold">${u.username || '—'}</td>
      <td class="py-2.5 px-4">${u.email}</td>
      <td class="py-2.5 px-4 capitalize"><span class="bg-gray-200 text-gray-900 px-2 py-0.5 rounded border text-[11px] font-bold">${u.role}</span></td>
    </tr>
  `).join('');
}

document.addEventListener('DOMContentLoaded', initSession);
