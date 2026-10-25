import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const $=id=>document.getElementById(id);
const anonymousBtn=$('cloud-start'), googleBtn=$('cloud-google'), freshBtn=$('cloud-new');
const aliasInput=$('cloud-alias'), consent=$('cloud-consent'), message=$('cloud-status'), pill=$('cloud-pill');
const ALIAS_KEY='ova-wayuu-cloud-alias-v1';
const USER_KEY='ova-wayuu-cloud-user-v2';
const setStatus=(txt,type='')=>{message.textContent=txt;pill.textContent=type==='ok'?'Sincronizado':type==='bad'?'Error':type==='off'?'Sin configurar':'Sin iniciar';pill.className='cloudBadge '+(type==='ok'?'ok':type==='bad'?'bad':'');};
const ready=!!firebaseConfig.apiKey && !!firebaseConfig.projectId && !JSON.stringify(firebaseConfig).includes('PEGUE_');
let active=false, sending=false;
if(!ready){
  setStatus('Firebase sin configurar. Puede realizar las actividades, pero solo se guardarán en su navegador.','off');
  anonymousBtn.disabled=true;googleBtn.disabled=true;freshBtn.disabled=true;
}else{
 const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getFirestore(app);
 const savedAlias=localStorage.getItem(ALIAS_KEY)||'';
 aliasInput.value=savedAlias;
 const codeOk=a=>/^[A-Za-z0-9_-]{3,24}$/.test(a);
 function validate(){
  if(!consent.checked)throw new Error('Debe confirmar la autorización institucional antes de enviar información.');
  const alias=aliasInput.value.trim().toUpperCase();
  if(!codeOk(alias))throw new Error('Use un código de 3 a 24 caracteres, sin nombres ni datos personales.');
  const prior=localStorage.getItem(ALIAS_KEY);
  if(prior && prior!==alias)throw new Error('Ya existe una sesión con otro código. Primero seleccione «Terminar / nueva sesión».');
  return alias;
 }
 function bindIdentity(user,alias){
  const prevUid=localStorage.getItem(USER_KEY);
  if(prevUid && prevUid!==user.uid)window.ovaRestartLocal?.(); // Evita mezclar respuestas de personas distintas.
  localStorage.setItem(USER_KEY,user.uid);
  localStorage.setItem(ALIAS_KEY,alias);
  active=true;
  setStatus('Cuenta '+(user.isAnonymous?'sin correo':'Google')+' conectada, código '+alias+'. Sus respuestas se enviarán a Firebase al guardar una actividad.','ok');
 }
 async function begin(mode){
  const btn=mode==='google'?googleBtn:anonymousBtn;
  if(sending)return;
  btn.disabled=true;
  try{
   const alias=validate();
   let user=auth.currentUser;
   if(mode==='anonymous'){
     if(user&&!user.isAnonymous)throw new Error('Ya hay una sesión Google abierta. Pulse «Terminar / nueva sesión» para entrar sin correo.');
     user=user||((await signInAnonymously(auth)).user);
   }else{
     if(user?.isAnonymous)throw new Error('Ya hay una sesión anónima. Pulse «Terminar / nueva sesión» antes de cambiar a Google.');
     user=user||((await signInWithPopup(auth,new GoogleAuthProvider())).user);
   }
   bindIdentity(user,alias);
  }catch(e){setStatus('No se pudo iniciar: '+(e.code||e.message||'error desconocido'),'bad');}
  finally{btn.disabled=false;}
 }
 anonymousBtn.addEventListener('click',()=>begin('anonymous'));
 googleBtn.addEventListener('click',()=>begin('google'));
 onAuthStateChanged(auth,u=>{if(!active&&u&&savedAlias)setStatus('Existe una sesión previa ('+savedAlias+'). Marque la autorización y pulse el botón correspondiente para reanudarla.');});
 window.ovaCloud={async sendSnapshot(state){
   if(!active){const m='Primero inicie sesión arriba con «Continuar sin correo» o «Continuar con Google».';setStatus('El avance quedó guardado en este navegador. '+m);return {ok:false,needsLogin:true,reason:m};}
   if(sending){const m='Ya existe un guardado en curso; espere un momento y pulse Enviar nuevamente.';setStatus(m);return {ok:false,reason:m};}
   const u=auth.currentUser;
   if(!u){active=false;const m='La sesión está cerrada; inicie sesión de nuevo.';setStatus(m,'bad');return {ok:false,needsLogin:true,reason:m};}
   sending=true;
   try{
    const alias=validate();
    const keys=['q1','q2','q3','q4','q5','q6','a1','a2','a3','a4a','a4b','a4c','a5','final','c1','c2','c3','c4','c5'];
    const answers={};
    for(const k of keys){const v=state.answers?.[k];if(typeof v==='string')answers[k]=v.slice(0,1000);else if(typeof v==='boolean')answers[k]=v;}
    const done=[...new Set((state.done||[]).filter(k=>['m1','m2','m3','m4','m5'].includes(k)))];
    const score=['q4','q5','q6'].reduce((n,k)=>n+(answers[k]==='1'?1:0),0);
    await setDoc(doc(db,'ova_respuestas',u.uid),{alias,answers,done,score,version:'OVA-2.2',updatedAt:serverTimestamp()});
    setStatus('Guardado en Firestore: '+alias+' · '+done.length+'/5 módulos · '+score+'/3 aciertos.','ok');
    return {ok:true,alias,modules:done.length,score};
   }catch(e){const reason=e.code||e.message||'error desconocido';setStatus('Error de sincronización ('+reason+'). Las respuestas siguen en este navegador.','bad');return {ok:false,reason};}
   finally{sending=false;}
 }};
 freshBtn.addEventListener('click',async()=>{
  if(!confirm('¿Finalizar esta sesión y borrar las respuestas locales del navegador? Los registros previamente enviados a Firebase permanecerán guardados.'))return;
  try{
   await signOut(auth);active=false;
   localStorage.removeItem(ALIAS_KEY);localStorage.removeItem(USER_KEY);
   aliasInput.value='';consent.checked=false;window.ovaRestartLocal?.();
   setStatus('Sesión cerrada y respuestas locales borradas. Puede iniciar otra sesión.');
  }catch(e){setStatus('No se pudo cerrar la sesión: '+(e.code||e.message),'bad');}
 });
}
