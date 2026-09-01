const OWNER='Trovix';
const REPO='meal-planner';
const BRANCH='main';
const ALLOWED_ORIGINS=new Set(['https://meal.james-platt.com','https://trovix.github.io']);
const MAX_BODY_BYTES=100_000;

function cors(origin){return{'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'86400','vary':'Origin'}}
function json(body,status=200,origin=''){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8',...(origin?cors(origin):{})}})}
function finite(n,min=0,max=1_000_000){return typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max}
function shortString(v,max){return typeof v==='string'&&v.trim().length>0&&v.length<=max}
function safeId(v){return typeof v==='string'&&/^[a-z0-9_]{1,64}$/.test(v)}
function validateRecipe(r){
 if(!r||typeof r!=='object'||Array.isArray(r))throw new Error('Recipe must be an object.');
 if(!safeId(r.id))throw new Error('Recipe ID must contain only lowercase letters, numbers and underscores.');
 if(!shortString(r.name,160)||!shortString(r.description,1000))throw new Error('Invalid recipe name or description.');
 if(!Number.isInteger(r.servings)||r.servings<1||r.servings>20)throw new Error('Servings must be between 1 and 20.');
 if(typeof r.active!=='boolean')throw new Error('Active must be true or false.');
 if(!r.macros||!finite(r.macros.calories_kcal,0,10000)||!finite(r.macros.protein_g,0,1000)||!finite(r.macros.carbs_g,0,2000)||!finite(r.macros.fat_g,0,1000))throw new Error('Invalid macros.');
 if(!Array.isArray(r.buy)||r.buy.length<1||r.buy.length>80)throw new Error('Recipe must have between 1 and 80 purchased ingredients.');
 for(const item of r.buy){if(!safeId(item?.ingredient_id)||!finite(item?.quantity,0.000001,1_000_000)||!shortString(item?.unit,24))throw new Error('Invalid purchased ingredient.');}
 if(!Array.isArray(r.pantry)||r.pantry.length>80||r.pantry.some(x=>!safeId(x)))throw new Error('Invalid pantry list.');
 if(!Array.isArray(r.instructions)||r.instructions.length<1||r.instructions.length>100||r.instructions.some(x=>!shortString(x,1000)))throw new Error('Invalid instructions.');
 if(r.ingredient_definitions!==undefined){
  if(!r.ingredient_definitions||typeof r.ingredient_definitions!=='object'||Array.isArray(r.ingredient_definitions)||Object.keys(r.ingredient_definitions).length>40)throw new Error('Invalid ingredient definitions.');
  for(const[id,d]of Object.entries(r.ingredient_definitions)){
   if(!safeId(id)||!d||typeof d!=='object'||!shortString(d.name,120)||!shortString(d.category,80)||!finite(d.pack_quantity,0.000001,1_000_000)||!shortString(d.pack_unit,24))throw new Error(`Invalid ingredient definition: ${id}.`);
  }
 }
 const allowed=new Set(['id','name','description','servings','active','macros','buy','pantry','instructions','ingredient_definitions']);
 for(const key of Object.keys(r))if(!allowed.has(key))throw new Error(`Unexpected recipe field: ${key}.`);
 return r;
}
async function secureEqual(a,b){
 if(typeof a!=='string'||typeof b!=='string')return false;
 const enc=new TextEncoder(),[ha,hb]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);
 const aa=new Uint8Array(ha),bb=new Uint8Array(hb);let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0;
}
function base64Utf8(text){const bytes=new TextEncoder().encode(text);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary)}
function ghHeaders(token){return{'authorization':`Bearer ${token}`,'accept':'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'meal-planner-publisher','content-type':'application/json'}}
async function publishToGitHub(recipe,token){
 const path=`data/recipes/${recipe.id}.json`,api=`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,lookup=await fetch(`${api}?ref=${BRANCH}`,{headers:ghHeaders(token)});
 let sha=null,updated=false;
 if(lookup.ok){const existing=await lookup.json();sha=existing.sha;updated=true}else if(lookup.status!==404){throw new Error(`GitHub lookup failed (${lookup.status}).`)}
 const body={message:`${updated?'Update':'Add'} recipe: ${recipe.name}`,content:base64Utf8(JSON.stringify(recipe,null,2)+'\n'),branch:BRANCH};if(sha)body.sha=sha;
 const write=await fetch(api,{method:'PUT',headers:ghHeaders(token),body:JSON.stringify(body)});
 if(!write.ok){console.error('GitHub write failed',write.status,await write.text());throw new Error(`GitHub write failed (${write.status}).`)}
 const result=await write.json();return{updated,path,commit:result.commit?.sha||null};
}
export default{async fetch(request,env){
 const origin=request.headers.get('origin')||'';
 if(request.method==='OPTIONS'){return ALLOWED_ORIGINS.has(origin)?new Response(null,{status:204,headers:cors(origin)}):new Response(null,{status:403})}
 const url=new URL(request.url);
 if(url.pathname==='/health'&&request.method==='GET')return json({ok:true});
 if(url.pathname!=='/publish'||request.method!=='POST')return json({error:'Not found.'},404,ALLOWED_ORIGINS.has(origin)?origin:'');
 if(!ALLOWED_ORIGINS.has(origin))return json({error:'Origin not allowed.'},403);
 if(!env.ADMIN_PASSWORD||!env.GITHUB_TOKEN)return json({error:'Publisher is not configured.'},503,origin);
 const declared=Number(request.headers.get('content-length')||0);if(declared>MAX_BODY_BYTES)return json({error:'Request too large.'},413,origin);
 let raw;try{raw=await request.text()}catch{return json({error:'Could not read request.'},400,origin)}if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)return json({error:'Request too large.'},413,origin);
 let body;try{body=JSON.parse(raw)}catch{return json({error:'Invalid JSON.'},400,origin)}
 if(!await secureEqual(body?.password,env.ADMIN_PASSWORD))return json({error:'Incorrect admin password.'},401,origin);
 let recipe;try{recipe=validateRecipe(body?.recipe)}catch(e){return json({error:e.message},400,origin)}
 try{return json({ok:true,...await publishToGitHub(recipe,env.GITHUB_TOKEN)},200,origin)}catch(e){console.error(e);return json({error:'Could not publish recipe.'},502,origin)}
}};