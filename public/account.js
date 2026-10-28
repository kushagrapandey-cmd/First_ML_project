'use strict';
(async()=>{
  if(!window.YTGuide)await new Promise(resolve=>window.addEventListener('ytguide:ready',resolve,{once:true}));
  const api=window.YTGuide;
  const $=s=>document.querySelector(s);
  let client,user=null,mode='signin',queue=[],working=false,sessionExpired=false,epoch=0,lastError='',generation=0;
  let accountReady=false,syncDebounce;
  const pendingKey='ytguide.pending.v3',operationPrefix='ytguide.operation.v4.';
  const tabId=crypto.randomUUID();
  let syncTask=null,activeOperation=null,lastCreated=0;
  function readQueue(){
    const legacy=api.read(pendingKey,[]);
    if(Array.isArray(legacy)&&legacy.length){
      let migrated=true;
      for(const [i,item] of legacy.entries()){
        const op={...item,operationId:item.operationId||'legacy-'+i,createdAt:item.createdAt||i};
        if(!api.write(operationPrefix+op.operationId,op))migrated=false;
      }
      if(migrated)api.write(pendingKey,[]);
    }
    const prefix=api.scope+':'+operationPrefix,items=[];
    for(const key of Object.keys(localStorage))if(key.startsWith(prefix)){
      const item=api.read(key.slice(api.scope.length+1),null);
      if(item&&typeof item.operationId==='string'&&typeof item.action==='string')items.push(item);
    }
    return items.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)||a.operationId.localeCompare(b.operationId));
  }
  const saveItem=item=>api.write(operationPrefix+item.operationId,item);
  const removeItem=item=>localStorage.removeItem(api.scope+':'+operationPrefix+item.operationId);

  const message=text=>{$('#account-message').textContent=text;};
  function status(){
    const cloud=!!user;
    $('#storage-label').textContent=cloud?'Account workspace · cloud sync':'Browse freely · sign in to save';
    $('#account-button').textContent=cloud&&!sessionExpired?`${user.name || 'Account'} · sync`:'Sign in / sync';
    $('#sync-status').textContent=!cloud?'Sign in to save your study activity':sessionExpired?'Session expired · sign in to resume sync':lastError||queue.length?`${queue.length} pending change${queue.length===1?'':'s'}${lastError?' · '+lastError:''}`:'Cloud synced ✓';
    $('#sync-retry').hidden=!cloud||(!queue.length&&!lastError);
    $('#sync-discard').hidden=!cloud||!queue[0]?.rejected;
    $('#cloud-refresh').hidden=!cloud;
    $('#workspace-help').textContent=cloud?'Your account data syncs across devices. Pending changes remain cached locally until confirmed.':'Browsing does not save study activity. Sign in to use your personal cloud workspace.';
    $('#guest-import').hidden=!cloud||!hasGuestData();
  }
  function setMode(next){
    mode=next;const signup=mode==='signup',verify=mode==='verify',reset=mode==='reset',newPassword=mode==='newPassword';
    $('#account-form').hidden=false;$('#signed-in-panel').hidden=true;
    $('#account-title').textContent={signin:'Welcome back.',signup:'Make room for learning.',verify:'Verify your email.',reset:'Reset your password.',newPassword:'Choose a new password.'}[mode];
    $('#account-copy').textContent=verify?'Enter the verification code sent to your email.':reset?'We’ll send a password-reset code to your email.':'Sign in to sync your lessons, notes, collections and progress.';
    $('#name-field').hidden=!signup;$('#account-name').required=signup;
    $('#password-field').hidden=verify||reset;$('#account-password').required=!verify&&!reset;
    $('#account-password').minLength=signup||newPassword?8:1;
    $('#account-password').autocomplete=signup||newPassword?'new-password':'current-password';
    $('#otp-field').hidden=!verify&&!newPassword;$('#account-otp').required=verify||newPassword;
    $('#account-submit').textContent={signin:'Sign in',signup:'Create account',verify:'Verify email',reset:'Send reset code',newPassword:'Reset password'}[mode];
    $('#account-switch').hidden=verify;$('#account-switch').textContent=signup?'Already registered? Sign in':'Create an account';
    $('#back-signin').hidden=mode==='signin'||mode==='signup';
    $('#account-switch').hidden=mode!=='signin'&&mode!=='signup';
    $('#forgot-password').hidden=mode!=='signin';$('#send-verification').hidden=!verify;
    message('');
  }
  async function openAccount(){
    if(!accountReady)await initialiseAccount();
    if(!accountReady){api.toast(lastError||'Account service is connecting. Please try again in a moment.');return;}
    if($('#lesson-dialog').open)$('#lesson-dialog').close();
    if(user&&!sessionExpired&&api.authenticated){$('#account-title').textContent='Your learning account.';$('#account-copy').textContent='A workspace that follows you.';$('#account-form').hidden=true;$('#signed-in-panel').hidden=false;$('#account-identity').textContent=user.email||user.name;$('.account-links').hidden=true;}
    else{$('.account-links').hidden=false;setMode('signin');}
    $('#account-dialog').showModal();
  }
  window.addEventListener('ytguide:signin',openAccount);
  async function token(){
    const result=await client.token();
    if(result.error)throw Object.assign(new Error(result.error.message||'Account connection unavailable. Retry when online.'),{status:result.error.status||503});
    if(!result.data?.token)throw Object.assign(new Error('Sign in again to resume cloud sync.'),{status:401});
    let subject;
    try{subject=JSON.parse(atob(result.data.token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub;}catch{}
    if(subject!==user?.id)throw Object.assign(new Error('The signed-in account changed. Reopen Sign in to reconnect safely.'),{status:401});
    return result.data.token;
  }
  async function cloud(body){
    const identity=user?.id,ownGeneration=generation;
    const bearer=await token();
    if(identity!==user?.id||ownGeneration!==generation)throw Object.assign(new Error('Account changed. Reconnect to continue.'),{status:401});
    const response=await fetch('/api/workspace',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+bearer,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
    const result=await response.json();
    if(!response.ok)throw Object.assign(new Error(result.error||'Cloud update failed.'),{status:response.status,result});
    return result;
  }
  async function refresh(){
    if(!user||working||queue.length||$('#lesson-dialog').open)return;
    const requestEpoch=epoch,identity=user.id;
    try{const result=await cloud();if(identity===user?.id&&requestEpoch===epoch&&!queue.length){api.applyCloud(result.workspace);lastError='';status();}}
    catch(error){if(identity!==user?.id||requestEpoch!==epoch)return;lastError=error.message;if(error.status===401){sessionExpired=true;api.setAuthenticated(false);}status();}
  }
  async function connect(nextUser){
    const changed=user?.id!==nextUser.id;user=nextUser;sessionExpired=false;lastError='';generation++;api.setAuthenticated(false);
    if(changed){api.setScope('user:'+user.id);queue=readQueue();}
    const identity=user.id,ownGeneration=generation;
    const result=await cloud();
    if(user?.id!==identity||generation!==ownGeneration)return;
    queue=readQueue();api.applyCloud(result.workspace,queue);
    for(const item of queue.filter(q=>q.blocked)){const latest=result.workspace.notes.find(n=>n.video_id===item.video.id);if(latest)api.conflict(item.video.id,latest);}
    api.setAuthenticated(true);status();processQueue();
  }
  function enqueue(body){
    if(!user)return;
    queue=readQueue();epoch++;
    if(body.action==='note')body.version=api.getNoteVersion(body.video.id);
    const merge=queue.find((q,index)=>q.operationId!==activeOperation&&q.owner===tabId&&q.action===body.action&&q.video?.id===body.video?.id&&['note','lesson'].includes(q.action));
    if(merge){if(body.action==='note')merge.content=body.content;else Object.assign(merge.patch,body.patch);}
    else queue.push({...body,operationId:crypto.randomUUID(),owner:tabId,createdAt:(lastCreated=Math.max(Date.now(),lastCreated+1))});
    const pending=merge||queue.at(-1);saveItem(pending);status();
    if(body.action==='note'){clearTimeout(syncDebounce);syncDebounce=setTimeout(processQueue,700);}
    else processQueue();
  }
  function processQueue(){
    if(syncTask)return syncTask;
    if(!user||sessionExpired)return Promise.resolve();
    queue=readQueue();if(!queue.length)return Promise.resolve();
    const identity=user.id,ownGeneration=generation;
    const run=()=>identity===user?.id?drainQueue():undefined;
    syncTask=Promise.resolve().then(()=>navigator.locks?navigator.locks.request('ytguide-sync:'+identity,{ifAvailable:true},lock=>lock&&run()):run()).finally(()=>{syncTask=null;if(user&&generation!==ownGeneration)processQueue();});
    return syncTask;
  }
  async function drainQueue(){
    queue=readQueue();
    if(working||!user||sessionExpired||!queue.length)return;
    working=true;const identity=user.id,ownGeneration=generation;
    try{
      while(user?.id===identity&&generation===ownGeneration){
        queue=readQueue();if(!queue.length)break;
        const item=queue[0];activeOperation=item.operationId;
        if(item.rejected){lastError='Server rejected a change · discard it or export a backup';break;}
        if(item.blocked){lastError='Resolve the note conflict in its lesson';break;}
        try{
          const result=await cloud(item);
          if(user?.id!==identity||generation!==ownGeneration)return;
          queue=readQueue();
          if(item.action==='note'){
            api.noteSynced(item.video.id,item.content,result.note.version);
            for(const following of queue.slice(1))if(following.owner===item.owner&&following.action==='note'&&following.video.id===item.video.id&&following.version===item.version){following.version=result.note.version;saveItem(following);}
          }
          removeItem(item);queue=readQueue();lastError='';
        }catch(error){
          if(user?.id!==identity||generation!==ownGeneration)return;
          if(error.status===409&&item.action==='note'&&error.result?.note){
            queue=readQueue();const latest=error.result.note;
            if(latest.content===item.content){api.noteSynced(item.video.id,item.content,latest.version);for(const following of queue.slice(1))if(following.owner===item.owner&&following.action==='note'&&following.video.id===item.video.id&&following.version===item.version){following.version=latest.version;saveItem(following);}removeItem(item);queue=readQueue();continue;}
            item.blocked=true;saveItem(item);api.conflict(item.video.id,latest);lastError='Note conflict · open the affected lesson';
          }else if(error.status===409&&['createCollection','bookmark'].includes(item.action)){
            const result=await cloud();if(user?.id!==identity||generation!==ownGeneration)return;const exists=item.action==='createCollection'?result.workspace.collections.some(c=>c.id===item.id):result.workspace.bookmarks.some(b=>b.id===item.id);
            if(exists){removeItem(item);queue=readQueue();continue;}item.rejected=true;saveItem(item);lastError=error.message;
          }else{lastError=error.message;if([400,404,409,413,415].includes(error.status)){item.rejected=true;saveItem(item);}if(error.status===401){sessionExpired=true;api.setAuthenticated(false);}}
          break;
        }
      }
    }finally{working=false;activeOperation=null;status();}
  }
  window.addEventListener('ytguide:flush-sync',()=>{clearTimeout(syncDebounce);processQueue();});
  window.addEventListener('ytguide:mutation',event=>enqueue({...event.detail}));
  window.addEventListener('ytguide:resolve-note',event=>{
    const {id,replace}=event.detail;
    queue=readQueue();for(const item of queue)if(item.action==='note'&&item.video.id===id)removeItem(item);queue=readQueue();lastError='';
    if(replace){const video=api.state.lessonIndex[id];enqueue({action:'note',video,content:api.state.notes[id]||''});}
    else processQueue();status();
  });
  $('#account-button').addEventListener('click',openAccount);
  $('#close-account').addEventListener('click',()=>{$('#account-dialog').close();api.clearIntent();$('#account-password').value='';$('#account-otp').value='';});
  $('#account-switch').addEventListener('click',()=>setMode(mode==='signup'?'signin':'signup'));
  $('#back-signin').addEventListener('click',()=>setMode('signin'));
  $('#account-dialog').addEventListener('cancel',()=>api.clearIntent());
  $('#forgot-password').addEventListener('click',()=>setMode('reset'));
  $('#send-verification').addEventListener('click',async()=>{
    try{const result=await client.emailOtp.sendVerificationOtp({email:$('#account-email').value.trim(),type:'email-verification'});if(result.error)throw new Error(result.error.message);message('Verification code requested. Check your inbox and spam folder.');}catch(e){message(e.message);}
  });
  $('#account-form').addEventListener('submit',async event=>{
    event.preventDefault();$('#account-submit').disabled=true;message('Connecting…');
    const email=$('#account-email').value.trim(),password=$('#account-password').value,otp=$('#account-otp').value.trim();
    try{
      let result;
      if(mode==='signup')result=await client.signUp.email({email,password,name:$('#account-name').value.trim()});
      else if(mode==='signin')result=await client.signIn.email({email,password});
      else if(mode==='verify')result=await client.emailOtp.verifyEmail({email,otp});
      else if(mode==='reset'){
        result=await client.emailOtp.sendVerificationOtp({email,type:'forget-password'});
        if(result.error)throw new Error(result.error.message);
        setMode('newPassword');message('If this account exists, check your inbox for a reset code.');return;
      }else if(mode==='newPassword'){
        result=await client.emailOtp.resetPassword({email,otp,password});
        if(result.error)throw new Error(result.error.message);
        setMode('signin');message('Password reset. Sign in with your new password.');return;
      }
      if(result?.error){
        if(result.error.code==='EMAIL_NOT_VERIFIED'){setMode('verify');message('Verify your email before signing in. Use Send verification code below.');return;}
        throw new Error(result.error.message||'Could not sign in.');
      }
      const session=await client.getSession();
      if(session.error)throw new Error(session.error.message);
      if(session.data?.user){await connect(session.data.user);$('#account-dialog').close();$('#account-password').value='';$('#account-otp').value='';api.toast('Signed in. Your account workspace is ready.');api.resumeIntent();}
      else if(mode==='signup'||mode==='verify'){setMode('verify');message('Verify your email, then sign in.');}
      else throw new Error('Sign-in returned no session. Please retry; cookies must be enabled for this site.');
    }catch(error){if(error.status===401){sessionExpired=true;api.setAuthenticated(false);}message(error.message||'Account service is unavailable.');}
    finally{$('#account-submit').disabled=false;}
  });
  $('#sign-out').addEventListener('click',async()=>{
    api.flushNote();await processQueue();
    if(queue.length&&!confirm('Some changes have not synced. They will stay cached on this device for this account. Sign out anyway?'))return;
    try{
      const result=await client.signOut();if(result.error)throw new Error(result.error.message);
      const oldScope=api.scope,pending=readQueue().length;
      api.setAuthenticated(false);user=null;generation++;queue=[];lastError='';sessionExpired=false;
      if(!pending){try{for(const key of Object.keys(localStorage))if(key.startsWith(oldScope+':'))localStorage.removeItem(key);}catch{}}
      api.setScope('guest');status();$('#account-dialog').close();api.toast('Signed out. Study activity is locked until you sign in again.');
    }catch(error){api.toast(error.message);}
  });
  $('#sync-retry').addEventListener('click',()=>{if(sessionExpired)openAccount();else{lastError='';processQueue();}});
  $('#sync-discard').addEventListener('click',async()=>{
    if(!queue[0]?.rejected||!confirm('Discard the server-rejected change? Export a workspace backup first if you want to keep a separate copy.'))return;
    removeItem(queue[0]);queue=readQueue();lastError='';await processQueue();await refresh();status();
  });
  $('#cloud-refresh').addEventListener('click',()=>{if(queue.length)api.toast('Sync pending changes before refreshing.');else if($('#lesson-dialog').open)api.toast('Close the lesson before refreshing.');else refresh();});
  window.addEventListener('online',processQueue);
  window.addEventListener('storage',event=>{
    if(user&&event.key?.startsWith(api.scope+':'+operationPrefix)){queue=readQueue();epoch++;status();processQueue();}
  });
  window.addEventListener('focus',async()=>{
    if(!client||!user)return;
    const result=await client.getSession();
    if(result.error)return;
    if(!result.data?.user){sessionExpired=true;api.setAuthenticated(false);status();return;}
    if(sessionExpired||result.data?.user?.id!==user.id){if(result.data?.user)await connect(result.data.user).catch(()=>{api.setAuthenticated(false);});return;}
    if(queue.length)processQueue();else refresh();
  });
  setInterval(()=>{if(queue.length&&!queue[0].blocked)processQueue();},15000);
  function guestSnapshot(){
    const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
    const saved=read('ytguide.saved.v2',[]),notes=read('ytguide.notes.v2',{}),completed=read('ytguide.completed.v2',[]),index=read('ytguide.lessons.v3',{}),positions=read('ytguide.positions.v3',{}),bookmarks=read('ytguide.bookmarks.v3',{}),collections=read('ytguide.collections.v3',[]),memberships=read('ytguide.memberships.v3',{});
    const safeSaved=Array.isArray(saved)?saved.filter(api.validVideo):[];
    const lessons={...(index&&typeof index==='object'?index:{}),...Object.fromEntries(safeSaved.map(v=>[v.id,v]))};
    for(const id of new Set([...Object.keys(notes||{}),...(Array.isArray(completed)?completed:[])]))if(/^[\w-]{11}$/.test(id)&&!lessons[id])lessons[id]={id,title:`YouTube lesson ${id}`,channel:'YouTube',source:'catalogue'};
    const cs=Array.isArray(collections)?collections.filter(c=>c&&typeof c.id==='string'&&typeof c.name==='string').slice(0,50):[];
    return {collections:cs,lessons:Object.values(lessons).filter(api.validVideo).slice(0,300).map(v=>({video:v,saved:safeSaved.some(s=>s.id===v.id),completed:Array.isArray(completed)&&completed.includes(v.id),position:Number.isSafeInteger(positions?.[v.id])?positions[v.id]:0,note:typeof notes?.[v.id]==='string'?notes[v.id].slice(0,8000):'',bookmarks:Array.isArray(bookmarks?.[v.id])?bookmarks[v.id].slice(0,100):[],collections:cs.filter(c=>Array.isArray(memberships?.[v.id])&&memberships[v.id].includes(c.id)).map(c=>c.name)}))};
  }
  function hasGuestData(){const snapshot=guestSnapshot();return snapshot.lessons.length>0||snapshot.collections.length>0;}
  $('#import-guest').addEventListener('click',async()=>{
    if(!user||queue.length){api.toast('Sync pending changes before importing.');return;}
    const button=$('#import-guest');button.disabled=true;const snapshot=guestSnapshot(),identity=user.id;
    try{
      const batches=Math.max(1,Math.ceil(snapshot.lessons.length/25));
      for(let i=0;i<batches;i++){
        if(user?.id!==identity)throw new Error('Account changed. Import stopped.');
        const body={action:'import',lessons:snapshot.lessons.slice(i*25,(i+1)*25),collections:snapshot.collections};
        const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body))));hash[6]=(hash[6]&15)|64;hash[8]=(hash[8]&63)|128;
        const hex=[...hash.slice(0,16)].map(b=>b.toString(16).padStart(2,'0')).join('');body.id=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
        await cloud(body);
      }
      await refresh();api.toast('Guest workspace imported. Existing cloud notes were preserved.');
    }catch(error){api.toast('Import stopped: '+error.message+'. Guest originals remain on this device.');}
    finally{button.disabled=false;}
  });
  let connecting=false;
  async function initialiseAccount(){
    if(connecting)return;
    connecting=true;
    try{
      const response=await fetch('/api/workspace?action=config',{cache:'no-store',signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('Account service is unavailable. Tap Sign in to retry.');
      const config=await response.json();
      if(!config.accountsConfigured)throw new Error('Account service is not configured. Please contact the site owner.');
      const sdk=await import('/auth-sdk.js');client=sdk.createClient();accountReady=true;
      const result=await client.getSession();if(result.error)throw new Error(result.error.message);
      if(result.data?.user)await connect(result.data.user);
      lastError='';status();
    }catch(error){lastError=error.message;if(user)sessionExpired=true;api.setAuthenticated(false);accountReady=!!client;status();console.warn('Account connection unavailable; saving is locked.');}
    finally{connecting=false;}
  }
  await initialiseAccount();
})();

