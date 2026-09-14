const socket=io();
const $=id=>document.getElementById(id);
function print(t){$("term").textContent+=t;$("term").scrollTop=$("term").scrollHeight}
socket.on("terminal-output",print);
socket.on("server-output",print);
socket.on("process-status",s=>{
 $("proc").textContent=s.running?"Running":"Stopped";
 $("status").textContent=s.running?"● Online":"● Offline";
 $("status").style.color=s.running?"#59e39a":"#ff6b7d";
});
async function save(){
 const r=await fetch("/api/config",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({startupCommand:$("startup").value})});
 const d=await r.json(); if(!r.ok) alert(d.error||"Save failed"); else alert("Startup command saved.");
}
async function loadConfig(){
 const d=await (await fetch("/api/config")).json();
 $("startup").value=d.startupCommand||"";
 $("root").textContent=location.host;
}
async function startServer(){
 const r=await fetch("/api/server/start",{method:"POST"}),d=await r.json();
 if(!r.ok) alert(d.error||"Start failed");
}
async function stopServer(){
 const r=await fetch("/api/server/stop",{method:"POST"}),d=await r.json();
 if(!r.ok) alert(d.error||"Stop failed");
}
async function loadFiles(){
 const p=$("path").value;
 const r=await fetch("/api/files?path="+encodeURIComponent(p)),d=await r.json();
 if(!r.ok)return alert(d.error);
 $("files").innerHTML=d.items.map(x=>`<div class="file"><span>${x.type==="directory"?"📁":"📄"} ${x.name}</span><small>${x.size==null?"":x.size+" bytes"}</small></div>`).join("");
}
function run(){
 const c=$("cmd").value.trim();if(!c)return;
 print("$ "+c+"\n");socket.emit("terminal-input",c);$("cmd").value="";
}
$("cmd").addEventListener("keydown",e=>{if(e.key==="Enter")run()});
loadConfig();loadFiles();
