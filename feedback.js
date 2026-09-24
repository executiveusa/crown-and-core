import{createClient}from'https://esm.sh/@supabase/supabase-js@2';
const supabase=createClient('https://cyxdevcjycmffhmwxojh.supabase.co','sb_publishable_PoqI-3PsCqewtJWJ0Z73Ag_5hIE0oKI');
const CLIENT='crown-and-core',VERSION='r3-v0.1';
const sessionId=crypto.randomUUID();
const qs=new URLSearchParams(location.search),source=(qs.get('source')||'direct').slice(0,40);
async function track(event_type){try{await supabase.from('macs_r3_events').insert({client_slug:CLIENT,session_id:sessionId,source,event_type,workflow_version:VERSION})}catch{}}
track('opened');
const form=document.querySelector('#r3-form'),status=document.querySelector('#status');
form.addEventListener('submit',async e=>{e.preventDefault();status.textContent='Sending…';const data=new FormData(form);const rating=Number(data.get('rating'));if(!rating){status.textContent='Choose a rating first.';return}const payload={client_slug:CLIENT,session_id:sessionId,source,rating,service:(data.get('service')||'').toString().slice(0,80)||null,comment:(data.get('comment')||'').toString().trim().slice(0,1200)||null,return_interest:data.get('return_interest')==='on',quote_permission:false,workflow_version:VERSION};const{error}=await supabase.from('macs_r3_feedback').insert(payload);if(error){status.textContent='Could not send. Please try again.';return}await track('submitted');document.querySelector('#feedback-card').classList.add('hidden');document.querySelector('#thanks').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'})});
document.querySelector('#review-link').addEventListener('click',()=>track('review_click'));
document.querySelector('#booking-link').addEventListener('click',()=>track('booking_click'));