(() => {
  const form=document.querySelector('#feedback-form');
  if(!form)return;
  const status=document.querySelector('#feedback-status'),button=document.querySelector('#feedback-submit');
  let pending,submitting=false;
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(submitting || !form.reportValidity())return;
    const fields=Object.fromEntries(new FormData(form));
    if(fields.message.trim().length<10){status.textContent='Please write at least 10 characters of feedback.';return;}
    const fingerprint=JSON.stringify(fields);
    if(!pending || pending.fingerprint!==fingerprint)pending={fingerprint,requestId:crypto.randomUUID()};
    submitting=true;button.disabled=true;button.textContent='Sending…';form.setAttribute('aria-busy','true');
    status.textContent='Sending your feedback…';status.dataset.state='pending';
    try {
      const response=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...fields,requestId:pending.requestId}),signal:AbortSignal.timeout(20000)});
      const result=await response.json();
      if(!response.ok || !result.ok)throw new Error(result.error||'Could not confirm delivery. Please try again or use the email link.');
      // Keep edits made while a request was in flight.
      if(JSON.stringify(Object.fromEntries(new FormData(form)))===fingerprint)form.reset();
      pending=null;status.dataset.state='success';status.textContent='Your feedback has been sent. Thank you!';
    } catch(error) {
      status.dataset.state='error';status.textContent=error.name==='TimeoutError'?'Sending took too long. Your message is still here; retry or use the email link.':error.message||'Unable to send. Please try again or use the email link.';
    } finally {submitting=false;button.disabled=false;button.textContent='Send feedback ↗';form.removeAttribute('aria-busy');}
  });
})();
