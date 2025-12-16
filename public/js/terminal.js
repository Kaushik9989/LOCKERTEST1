// Basic, dependency-free client behavior for the terminal landing page.
// Called automatically from footer script include.
(function(){
const newBtn = document.getElementById('new-user-btn');
const enterBtn = document.getElementById('enter-code-btn');
const codeInput = document.getElementById('unique-code');
const feedback = document.getElementById('terminal-feedback');


if(newBtn){
newBtn.addEventListener('click', ()=>{
feedback.textContent = 'Starting new user flow...';
// Navigate to new user registration / pickup flow
window.location.href = '/terminal/new';
});
}


if(enterBtn){
enterBtn.addEventListener('click', ()=>{
const code = (codeInput.value || '').trim();
if(!code){
feedback.textContent = 'Please enter your unique code.';
return;
}
feedback.textContent = 'Verifying code...';


// Basic POST to server for validation — adapt route as needed
fetch('/terminal/verify-code', {
method:'POST',
headers:{'Content-Type':'application/json'},
body: JSON.stringify({code})
}).then(r=>r.json()).then(j=>{
if(j && j.ok){
feedback.textContent = 'Code accepted. Redirecting...';
// server will provide target route
window.location.href = j.next || '/terminal/session';
} else {
feedback.textContent = j && j.error ? j.error : 'Code not found. Try again or contact support.';
}
}).catch(err=>{
console.error(err);
feedback.textContent = 'Network error — try again.';
});
});


// Allow Enter key in input
codeInput && codeInput.addEventListener('keydown', (e)=>{
if(e.key === 'Enter') enterBtn.click();
});
}
})();