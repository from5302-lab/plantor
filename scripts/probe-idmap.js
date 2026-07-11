const BASE="https://www.classcard.net";
const UA={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"};
const jar=new Map();
function store(sc){for(const c of sc||[]){const p=c.split(";")[0];const e=p.indexOf("=");if(e>0)jar.set(p.slice(0,e).trim(),p.slice(e+1).trim());}}
function ck(){return[...jar].map(([k,v])=>`${k}=${v}`).join("; ");}
async function get(p){const r=await fetch(BASE+p,{headers:{...UA,Cookie:ck()}});store(r.headers.getSetCookie());return r;}
async function post(p,f,ex={}){const r=await fetch(BASE+p,{method:"POST",headers:{...UA,"Content-Type":"application/x-www-form-urlencoded",Cookie:ck(),...ex},body:new URLSearchParams(f)});store(r.headers.getSetCookie());return r;}
async function login(){const pg=await(await get("/login")).text();const m=/name=["']sess_key["']\s+value=["']([^"']+)["']/i.exec(pg);const r=await post("/LoginProc",{sess_key:m[1],login_id:process.env.CC_ID,login_pwd:process.env.CC_PW,redirect:""});if((await r.json()).result!=="ok")throw new Error("login");console.log("[login] ok");}
function pageInfo(html){
  // 현재 반 이름: 초대코드 블록 앞쪽에서 제목 추출
  const ic=html.indexOf("class-code-text");
  let title="";
  if(ic>=0){
    const before=html.slice(Math.max(0,ic-3000),ic);
    // 제목 후보: 큰 폰트 클래스나 g-class-name 류. 마지막 한글 텍스트 블록들에서 반 이름 패턴 찾기
    const cands=[...before.matchAll(/>([^<>]{2,50}[가-힣][^<>]{0,30})</g)].map(m=>m[1].trim()).filter(t=>t&&!/선생님|초대|공유|Plantor|클래스카드/.test(t));
    title=cands.length?cands[cands.length-1]:"";
  }
  const code=(html.match(/class-code-text[^>]*>(\d+)</)||[])[1]||"";
  const hasDict=html.includes("딕테이션");
  return {title,code,hasDict};
}
(async()=>{
  await login();
  // gClass 후보 전체 (config에 있는 것 + 듣기 의심)
  const idxs=["93468","82592","92730","82439","95899","111208","96356","1817980","110173","65419","78942","109586","127033","1589368","1308432","66998","110249","116419","120840"];
  for(const idx of idxs){
    try{
      const html=await(await get("/GClass/report/"+idx)).text();
      const {title,code,hasDict}=pageInfo(html);
      console.log(`${idx}: 딕테이션=${hasDict?"Y":"n"} code=${code} title="${title}"`);
    }catch(e){console.log(`${idx}: ERR ${e.message}`);}
  }
})().then(()=>process.exit(0)).catch(e=>{console.error("ERR:",e.message);process.exit(1);});
