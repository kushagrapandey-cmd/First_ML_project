// Small same-origin adapter. Session reads always go to the server, avoiding
// stale client session caches after sign-in and sign-out.
export function createClient(){
  async function call(path,body){
    try{
      const response=await fetch('/api/auth/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
      const data=await response.json();
      if(!response.ok)return {data:null,error:{code:data?.code,message:data?.message||data?.error||'Account request failed. Please try again.'}};
      return {data,error:null};
    }catch(error){return {data:null,error:{message:error.name==='TimeoutError'?'Account request timed out. Please retry.':'Could not connect to your account. Check your connection and retry.'}};}
  }
  return {
    getSession:()=>call('get-session?disableCookieCache=true'),
    token:()=>call('token'),
    signIn:{email:body=>call('sign-in/email',body)},
    signUp:{email:body=>call('sign-up/email',body)},
    signOut:()=>call('sign-out',{}),
    emailOtp:{sendVerificationOtp:body=>call('email-otp/send-verification-otp',body),verifyEmail:body=>call('email-otp/verify-email',body),resetPassword:body=>call('email-otp/reset-password',body)}
  };
}
