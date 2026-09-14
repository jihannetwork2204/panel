const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const session = require("express-session");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const ROOT = path.resolve(process.env.PANEL_ROOT || process.cwd());
const DATA = path.join(ROOT, "data");
const CONFIG = path.join(DATA, "config.json");

fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(CONFIG)) {
  fs.writeFileSync(CONFIG, JSON.stringify({
    startupCommand: "npm start"
  }, null, 2));
}

app.use(express.json({limit:"10mb"}));
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret: process.env.SESSION_SECRET || "change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax" }
}));
app.use(express.static(path.join(ROOT, "public")));

function safePath(p="") {
  const resolved = path.resolve(ROOT, p);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    throw new Error("Invalid path");
  }
  return resolved;
}

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG,"utf8")); }
  catch { return {startupCommand:"npm start"}; }
}
function writeConfig(c) {
  fs.writeFileSync(CONFIG, JSON.stringify(c,null,2));
}

app.get("/api/config", (req,res) => res.json(readConfig()));

app.post("/api/config", (req,res) => {
  const command = String(req.body.startupCommand ?? "").trim();
  writeConfig({...readConfig(), startupCommand: command});
  res.json({ok:true, startupCommand:command});
});

app.get("/api/files", (req,res) => {
  try {
    const dir = safePath(req.query.path || "");
    const items = fs.readdirSync(dir,{withFileTypes:true}).map(x => ({
      name:x.name, type:x.isDirectory() ? "directory":"file",
      size:x.isFile() ? fs.statSync(path.join(dir,x.name)).size : null
    }));
    res.json({path:req.query.path||"", items});
  } catch(e) { res.status(400).json({error:e.message}); }
});

app.get("/api/file", (req,res) => {
  try {
    const file=safePath(req.query.path||"");
    if (!fs.statSync(file).isFile()) throw new Error("Not a file");
    res.type("text/plain").send(fs.readFileSync(file,"utf8"));
  } catch(e) { res.status(400).json({error:e.message}); }
});

app.post("/api/file", (req,res) => {
  try {
    const file=safePath(req.body.path||"");
    fs.writeFileSync(file,String(req.body.content??""),"utf8");
    res.json({ok:true});
  } catch(e) { res.status(400).json({error:e.message}); }
});

app.post("/api/mkdir", (req,res) => {
  try { fs.mkdirSync(safePath(req.body.path),{recursive:true}); res.json({ok:true}); }
  catch(e){res.status(400).json({error:e.message});}
});

app.delete("/api/file", (req,res) => {
  try {
    const target=safePath(req.body.path);
    if(target===ROOT) throw new Error("Cannot delete panel root");
    fs.rmSync(target,{recursive:true,force:true});
    res.json({ok:true});
  } catch(e){res.status(400).json({error:e.message});}
});

let managedProcess=null;

function commandForShell(cmd) {
  if (process.platform === "win32") return {shell:"cmd.exe", args:["/d","/s","/c",cmd]};
  return {shell:"/bin/bash", args:["-lc",cmd]};
}

function startManaged(command, socket) {
  if (!command) throw new Error("Startup command is empty");
  if (managedProcess) throw new Error("Server process is already running");

  const spec=commandForShell(command);
  managedProcess=spawn(spec.shell,spec.args,{
    cwd:ROOT,
    env:process.env,
    stdio:["pipe","pipe","pipe"],
    windowsHide:true
  });

  socket?.emit("process-status",{running:true,command});
  managedProcess.stdout.on("data",d=>io.emit("server-output",d.toString()));
  managedProcess.stderr.on("data",d=>io.emit("server-output",d.toString()));
  managedProcess.on("close",code=>{
    io.emit("server-output",`\n[process exited with code ${code}]\n`);
    io.emit("process-status",{running:false,code});
    managedProcess=null;
  });
}

app.post("/api/server/start",(req,res)=>{
  try {
    startManaged(readConfig().startupCommand,null);
    res.json({ok:true});
  } catch(e){res.status(400).json({error:e.message});}
});
app.post("/api/server/stop",(req,res)=>{
  if(!managedProcess) return res.json({ok:true});
  managedProcess.kill("SIGTERM");
  res.json({ok:true});
});

io.on("connection",socket=>{
  socket.on("terminal-input",data=>{
    // Terminal is intentionally limited to the panel's working directory.
    const cmd=String(data||"").trim();
    if(!cmd) return;
    const spec=commandForShell(cmd);
    const p=spawn(spec.shell,spec.args,{
      cwd:ROOT, env:process.env, stdio:["pipe","pipe","pipe"], windowsHide:true
    });
    p.stdout.on("data",d=>socket.emit("terminal-output",d.toString()));
    p.stderr.on("data",d=>socket.emit("terminal-output",d.toString()));
    p.on("close",code=>socket.emit("terminal-output",`\n[exit ${code}]\n`));
  });
});

app.get("*",(req,res)=>res.sendFile(path.join(ROOT,"public","index.html")));

server.listen(PORT,()=>console.log(`Server panel running on http://localhost:${PORT}`));
