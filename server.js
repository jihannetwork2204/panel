// ==========================================
// Dev Center Software by dec.center (Node.js)
// Complete Academic, Portal & Mark Management System
// ==========================================

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');const express = require("express");
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


const app = express();
const PORT = process.env.PORT || 8787;

// Public files: logo and other existing assets
app.use(express.static(path.join(__dirname, 'public')));

// Middleware for parsing form data and managing sessions
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'dev_center_software_secret_key',
    resave: false,
    saveUninitialized: true
}));

// Admin Credentials & Cleared Lists
const ADMIN_USER = "admin";
const ADMIN_PASS = "dev";

let students_list = [];
let teachers_list = [];

// Tuition fee management
let tuition_fees = [];

// Teacher uploaded subject sheets (PDF). PDF files are stored in public/sheets.
let uploaded_sheets = [];
const SHEETS_DIR = path.join(__dirname, 'public', 'sheets');
if (!fs.existsSync(SHEETS_DIR)) fs.mkdirSync(SHEETS_DIR, { recursive: true });

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Small dependency-free multipart/form-data parser used only for teacher PDF uploads.
// It keeps the existing express.urlencoded/json middleware and does not require multer.
function parseTeacherSheetUpload(req, res, next) {
    const contentType = String(req.headers['content-type'] || '');
    const boundaryMatch = contentType.match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
    const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : '';

    if (!contentType.toLowerCase().startsWith('multipart/form-data') || !boundary) {
        return res.redirect('/teacher_portal?subtab=upload_sheet&msg=' + encodeURIComponent('Upload form is invalid. Please refresh the page and try again.'));
    }

    const MAX_BYTES = 21 * 1024 * 1024;
    const chunks = [];
    let total = 0;
    let tooLarge = false;

    req.on('data', chunk => {
        total += chunk.length;
        if (total <= MAX_BYTES) chunks.push(chunk);
        else tooLarge = true;
    });

    req.on('end', () => {
        if (tooLarge || total > MAX_BYTES) {
            return res.redirect('/teacher_portal?subtab=upload_sheet&msg=' + encodeURIComponent('PDF is too large. Maximum file size is 20 MB.'));
        }

        try {
            const raw = Buffer.concat(chunks);
            const marker = Buffer.from('--' + boundary);
            const fields = {};
            let file = null;
            let searchFrom = 0;

            // Parse each multipart section without decoding the PDF bytes as text.
            while (true) {
                const boundaryPos = raw.indexOf(marker, searchFrom);
                if (boundaryPos === -1) break;

                let partStart = boundaryPos + marker.length;
                if (raw.slice(partStart, partStart + 2).toString('ascii') === '--') break;
                if (raw.slice(partStart, partStart + 2).toString('ascii') === '\r\n') partStart += 2;

                const headerEnd = raw.indexOf(Buffer.from('\r\n\r\n'), partStart);
                if (headerEnd === -1) break;

                const nextBoundary = raw.indexOf(Buffer.from('\r\n--' + boundary), headerEnd + 4);
                if (nextBoundary === -1) break;

                const headers = raw.slice(partStart, headerEnd).toString('utf8');
                const data = raw.slice(headerEnd + 4, nextBoundary);
                const dispositionLineMatch = headers.match(/(?:^|\r\n)Content-Disposition:\s*([^\r\n]+)/i);

                if (dispositionLineMatch) {
                    const disposition = dispositionLineMatch[1];
                    const nameMatch = disposition.match(/(?:^|;)\s*name\s*=\s*"([^"]*)"/i) || disposition.match(/(?:^|;)\s*name\s*=\s*([^;\s]+)/i);
                    const filenameMatch = disposition.match(/(?:^|;)\s*filename\s*=\s*"([^"]*)"/i) || disposition.match(/(?:^|;)\s*filename\s*=\s*([^;\s]+)/i);
                    const typeMatch = headers.match(/(?:^|\r\n)Content-Type:\s*([^\r\n]+)/i);

                    if (nameMatch) {
                        const fieldName = nameMatch[1];
                        if (filenameMatch) {
                            const originalname = filenameMatch[1].replace(/^.*[\\/]/, '');
                            file = {
                                fieldName,
                                originalname,
                                mimetype: typeMatch ? typeMatch[1].trim().toLowerCase() : '',
                                buffer: data
                            };
                        } else {
                            fields[fieldName] = data.toString('utf8');
                        }
                    }
                }

                searchFrom = nextBoundary + 2;
            }

            req.body = fields;
            req.teacherSheetFile = file;
            next();
        } catch (err) {
            console.error('[Sheet Upload] multipart parse error:', err.message);
            return res.redirect('/teacher_portal?subtab=upload_sheet&msg=' + encodeURIComponent('Could not read the uploaded PDF. Please try again.'));
        }
    });

    req.on('error', err => {
        console.error('[Sheet Upload] request error:', err.message);
        if (!res.headersSent) {
            res.redirect('/teacher_portal?subtab=upload_sheet&msg=' + encodeURIComponent('Upload failed. Please try again.'));
        }
    });
}

function feeNumber(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

function feeDue(fee) {
    return Math.max(0, feeNumber(fee.payable) - feeNumber(fee.paid) - feeNumber(fee.scholarship));
}

function studentFees(studentId) {
    return tuition_fees.filter(f => f.student_id === studentId);
}


const DEFAULT_SUBJECTS = [
    {sl: "1", name: "Bangla-I", teacher: "TBA"},
    {sl: "2", name: "Bangla-II", teacher: "TBA"},
    {sl: "3", name: "English-I", teacher: "TBA"},
    {sl: "4", name: "English-II", teacher: "TBA"},
    {sl: "5", name: "Mathematics", teacher: "TBA"},
    {sl: "6", name: "ICT", teacher: "TBA"},
    {sl: "7", name: "Islam and Moral Education", teacher: "TBA"},
    {sl: "8", name: "Hindu and Moral Education", teacher: "TBA"},
    {sl: "9", name: "Bangladesh and Global Studies", teacher: "TBA"},
    {sl: "10", name: "SCIENCE", teacher: "TBA"},
    {sl: "11", name: "Fine Arts & Crafts", teacher: "TBA"}
];

let subjects_list = DEFAULT_SUBJECTS.map(sub => ({ ...sub }));

// Notice Board Database
let notice_board = [
    { id: 1, text: "২০২৬ সালের অর্ধবার্ষিক পরীক্ষার সিলেবাস ও রুটিন প্রকাশিত হয়েছে (ষষ্ঠ থেকে দশম শ্রেণি)।" },
    { id: 2, text: "নিয়মিত ক্লাস উপস্থিতি এবং শৃঙ্খলা বজায় রাখার সংক্রান্ত নির্দেশাবলি।" },
    { id: 3, text: "সহ-পাঠ্যক্রম কার্যক্রম এবং সাংস্কৃতিক প্রতিযোগিতার জন্য নিবন্ধন শুরু হয়েছে।" }
];

// Examination control and exam-wise marks/results
const EXAMS = [
    { id: 'tutorial1', title: '1st Tutorial Exam' },
    { id: 'half_yearly', title: 'Half Yearly Exam' },
    { id: 'tutorial2', title: '2nd Tutorial Exam' },
    { id: 'final', title: 'Final Exam' }
];

let exam_state = {};
EXAMS.forEach(exam => {
    exam_state[exam.id] = { active: false, startedAt: null, published: false, publishedAt: null };
});
let active_exam_id = null;
// Structure: marks_db[examId][room][subjectName][studentRoll] = { written, mcq, total, grade }
let marks_db = {};

function getExam(examId) {
    return EXAMS.find(e => e.id === examId) || null;
}
function getActiveExam() {
    return active_exam_id ? getExam(active_exam_id) : null;
}

// Normalize the active exam after loading persisted state.
if (!active_exam_id || !getExam(active_exam_id) || !(exam_state[active_exam_id] && exam_state[active_exam_id].active)) {
    const activeExam = EXAMS.find(e => exam_state[e.id] && exam_state[e.id].active);
    active_exam_id = activeExam ? activeExam.id : null;
}

function getExamMarks(examId, room, subject) {
    if (!examId) return {};
    if (!marks_db[examId]) marks_db[examId] = {};
    if (!marks_db[examId][room]) marks_db[examId][room] = {};
    if (!marks_db[examId][room][subject]) marks_db[examId][room][subject] = {};
    return marks_db[examId][room][subject];
}
function examTitle(examId) {
    const exam = getExam(examId);
    return exam ? exam.title : 'Examination';
}
// Teacher subject helpers: supports old single-subject accounts and new multi-subject accounts.
function getTeacherSubjects(teacher) {
    if (!teacher) return [];
    if (Array.isArray(teacher.subjects)) {
        return teacher.subjects.map(s => String(s || '').trim()).filter(Boolean);
    }
    const legacy = String(teacher.subject == null ? '' : teacher.subject).trim();
    return legacy ? [legacy] : [];
}

function normalizeTeacherSubjects(teacher) {
    const subjects = getTeacherSubjects(teacher)
        .filter((s, i, arr) => arr.findIndex(x => String(x).toLowerCase() === String(s).toLowerCase()) === i)
        .sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true }))
        .slice(0, 3);
    teacher.subjects = subjects;
    teacher.subject = subjects.join(', ');
    return subjects;
}

// Keep portal lists in a consistent order everywhere:
// subjects A-Z, teacher accounts by Teacher ID, and students by User ID.
function portalNaturalCompare(a, b) {
    return String(a == null ? '' : a).localeCompare(
        String(b == null ? '' : b),
        undefined,
        { numeric: true, sensitivity: 'base' }
    );
}

function sortPortalLists() {
    if (Array.isArray(subjects_list)) {
        subjects_list.sort((a, b) => portalNaturalCompare(a && a.name, b && b.name));
        subjects_list.forEach((sub, idx) => sub.sl = String(idx + 1));
    }
    if (Array.isArray(teachers_list)) {
        teachers_list.forEach(normalizeTeacherSubjects);
        teachers_list.sort((a, b) => portalNaturalCompare(a && a.id, b && b.id));
    }
    if (Array.isArray(students_list)) {
        students_list.sort((a, b) => portalNaturalCompare(a && a.id, b && b.id));
    }
}

// Subject ↔ Teacher assignment is automatic.
// A teacher is shown under every subject in teacher.subjects; multiple teachers can share one subject.
function syncSubjectTeacherAssignments() {
    if (!Array.isArray(subjects_list) || !Array.isArray(teachers_list)) return;

    subjects_list.forEach(sub => {
        const subjectName = String(sub && sub.name || '').trim();
        const assignedTeachers = teachers_list
            .filter(t => getTeacherSubjects(t).some(s =>
                String(s || '').trim().toLowerCase() === subjectName.toLowerCase()
            ))
            .sort((a, b) => portalNaturalCompare(a && a.id, b && b.id));

        sub.teacher = assignedTeachers.length
            ? assignedTeachers.map(t => {
                const name = String(t.name || t.id || 'Teacher').trim();
                const phone = String(t.phone || '').trim();
                return phone ? `${name}\n${phone}` : name;
            }).join('\n\n')
            : 'TBA';
    });
}

const RELIGION_SUBJECTS = {
    Islam: 'Islam and Moral Education',
    Hindu: 'Hindu and Moral Education'
};

function normalizeStudentReligion(student) {
    if (!student) return 'Islam';
    const value = String(student.religion || '').trim().toLowerCase();
    if (value === 'hindu' || value === 'hindu and moral education') {
        student.religion = 'Hindu';
    } else {
        student.religion = 'Islam';
    }
    return student.religion;
}

function studentHasSubject(student, subjectName) {
    const name = String(subjectName || '').trim().toLowerCase();
    if (name === RELIGION_SUBJECTS.Islam.toLowerCase()) return normalizeStudentReligion(student) === 'Islam';
    if (name === RELIGION_SUBJECTS.Hindu.toLowerCase()) return normalizeStudentReligion(student) === 'Hindu';
    return true;
}

function getSubjectsForStudent(student) {
    return subjects_list.filter(sub => studentHasSubject(student, sub.name));
}

function formatExamDate(dateValue) {
    if (!dateValue) return '—';
    return new Date(dateValue).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

let portal_settings = {
    school_name: "Dev.Center",
    tagline: "Software by NIGHT CLOUD",
    logo_type: "text", 
    logo_text: "DC",
    logo_url: "/logo.png",
    bg_color: "#FAF6F0",       
    header_color: "#ffffff",   
    accent_color: "#007bff",   
    ai_prompt: "তুমি একজন বন্ধুভাবাপন্ন বাংলা এআই সহকারী (AI Assistant), যে একদম মানুষের মতো সাবলীল বাংলায় কথা বলতে পারো। জিয়াননেটওয়ার্ক (JihanNetwork) পোর্টালে আসা ব্যবহারকারীদের সব প্রশ্নের উত্তর বাংলায় সুন্দর করে বুঝিয়ে দেবে।",
    home_title: "Welcome to Dev.Center",
    home_description: "Software by NIGHT CLOUD. Use the menu above to login as a Student, Teacher or Admin.",
    home_feature_title: "Academic Features:",
    home_feature_1: "Classes ranging from Class One (1) to Class Ten (10).",
    home_feature_2: "Dedicated Teacher Portal and management features.",
    home_feature_3: "Admin panel to dynamically manage subjects, teachers, and student details."
};


// ============================================================
// SINGLE SOURCE OF TRUTH: portal-data.json
// All persistent portal data is loaded from and saved to this
// one JSON file. No separate data JSON is used.
// ============================================================
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'portal-data.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readPortalData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return null;
        const raw = fs.readFileSync(DATA_FILE, 'utf8').trim();
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        console.log('[Storage] portal-data.json read error:', e.message);
        return null;
    }
}

function savePortalData() {
    // Automatic assignment and ordering are applied before every save,
    // so every page/selector uses the same current data.
    syncSubjectTeacherAssignments();
    sortPortalLists();

    const payload = {
        students_list,
        teachers_list,
        subjects_list,
        notice_board,
        exam_state,
        active_exam_id,
        marks_db,
        portal_settings,
        tuition_fees,
        uploaded_sheets
    };
    try {
        const tmp = DATA_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
        fs.renameSync(tmp, DATA_FILE);
        return true;
    } catch (e) {
        console.log('[Storage] portal-data.json write error:', e.message);
        return false;
    }
}

const savedPortalData = readPortalData();
if (savedPortalData) {
    if (Array.isArray(savedPortalData.students_list)) students_list = savedPortalData.students_list;
    if (Array.isArray(savedPortalData.teachers_list)) teachers_list = savedPortalData.teachers_list;
    if (Array.isArray(savedPortalData.subjects_list)) subjects_list = savedPortalData.subjects_list;
    if (Array.isArray(savedPortalData.notice_board)) notice_board = savedPortalData.notice_board;
    if (savedPortalData.exam_state && typeof savedPortalData.exam_state === 'object') {
        exam_state = savedPortalData.exam_state;
        EXAMS.forEach(exam => {
            if (!exam_state[exam.id]) {
                exam_state[exam.id] = { active:false, startedAt:null, published:false, publishedAt:null };
            }
        });
    }
    if (Object.prototype.hasOwnProperty.call(savedPortalData, 'active_exam_id')) {
        active_exam_id = savedPortalData.active_exam_id;
    }
    if (savedPortalData.marks_db && typeof savedPortalData.marks_db === 'object') {
        marks_db = savedPortalData.marks_db;
    }
    if (savedPortalData.portal_settings && typeof savedPortalData.portal_settings === 'object') {
        portal_settings = { ...portal_settings, ...savedPortalData.portal_settings };
    }
    if (portal_settings.logo_type === 'image' && !portal_settings.logo_url) {
        portal_settings.logo_url = '/logo.png';
    }
    if (Array.isArray(savedPortalData.tuition_fees)) {
        tuition_fees = savedPortalData.tuition_fees;
    }
    if (Array.isArray(savedPortalData.uploaded_sheets)) {
        uploaded_sheets = savedPortalData.uploaded_sheets;
    }
}

// Migrate old teacher records that used teacher.subject into teacher.subjects.
if (Array.isArray(teachers_list)) {
    teachers_list.forEach(normalizeTeacherSubjects);
}

// Keep Bangla-I present everywhere subjects_list is used, including
// Existing Subjects & Teachers List, student results, and printable result PDF.
// Older portal-data.json files may have been saved without this subject.
(function ensureBanglaI() {
    if (!Array.isArray(subjects_list)) subjects_list = [];

    const normalized = [];
    let banglaI = null;

    subjects_list.forEach(sub => {
        if (!sub || !sub.name) return;
        const name = String(sub.name).trim();
        if (!name) return;

        if (name.toLowerCase() === 'bangla-i') {
            if (!banglaI) {
                banglaI = {
                    sl: "1",
                    name: "Bangla-I",
                    teacher: sub.teacher || "TBA"
                };
            }
            return;
        }

        if (!normalized.some(existing => String(existing.name).trim().toLowerCase() === name.toLowerCase())) {
            normalized.push({ ...sub, name });
        }
    });

    if (!banglaI) banglaI = { ...DEFAULT_SUBJECTS[0] };

    subjects_list = [banglaI, ...normalized].map((sub, index) => ({
        ...sub,
        sl: String(index + 1)
    }));
})();

// Ensure both religion subjects exist even when an older portal-data.json is loaded.
(function ensureReligionSubjects() {
    if (!Array.isArray(subjects_list)) subjects_list = [];
    const required = [
        { name: RELIGION_SUBJECTS.Islam, teacher: 'TBA' },
        { name: RELIGION_SUBJECTS.Hindu, teacher: 'TBA' }
    ];
    required.forEach(item => {
        const exists = subjects_list.some(sub => String(sub && sub.name || '').trim().toLowerCase() === item.name.toLowerCase());
        if (!exists) subjects_list.push({ sl: String(subjects_list.length + 1), name: item.name, teacher: item.teacher });
    });
    subjects_list.forEach((sub, idx) => sub.sl = String(idx + 1));
})();

// Normalize religion for existing students. Older records default to Islam for backward compatibility.
students_list.forEach(normalizeStudentReligion);

// If old tuition_fees.json exists and the single JSON has no fee records yet,
// migrate it once into portal-data.json. After migration, portal-data.json is
// the only file used for tuition data.
try {
    const oldFeesFile = path.join(__dirname, 'tuition_fees.json');
    if ((!savedPortalData || !Array.isArray(savedPortalData.tuition_fees)) && fs.existsSync(oldFeesFile)) {
        const oldFees = JSON.parse(fs.readFileSync(oldFeesFile, 'utf8'));
        if (Array.isArray(oldFees)) tuition_fees = oldFees;
    }
} catch (e) {
    console.log('[Storage] Old tuition fee migration skipped:', e.message);
}

// Make sure the current in-memory state is reflected in the single JSON file.
teachers_list.forEach(normalizeTeacherSubjects);
savePortalData();

const PRESET_THEMES = {
    light_cream: { name: "Light Cream (Default)", bg_color: "#FAF6F0", header_color: "#ffffff", accent_color: "#007bff" },
    dark_purple: { name: "Dark Purple", bg_color: "#12081c", header_color: "#1a0b2e", accent_color: "#7b1fa2" },
    white_clean: { name: "White Clean (Light Mode)", bg_color: "#f4f6f9", header_color: "#ffffff", accent_color: "#007bff" },
    emerald_green: { name: "Emerald Green (School Theme)", bg_color: "#0e2f24", header_color: "#114232", accent_color: "#0b5345" },
    cyberpunk_neon: { name: "Cyberpunk Neon", bg_color: "#050505", header_color: "#12001a", accent_color: "#ff007f" },
    ocean_blue: { name: "Ocean Blue", bg_color: "#0a192f", header_color: "#172a45", accent_color: "#64ffda" },
    sunset_orange: { name: "Sunset Orange", bg_color: "#1c0d08", header_color: "#2c150c", accent_color: "#e67e22" },
    ruby_red: { name: "Ruby Red", bg_color: "#1f0909", header_color: "#330d0d", accent_color: "#c0392b" },
    midnight_amber: { name: "Midnight Amber", bg_color: "#111111", header_color: "#1d1d1d", accent_color: "#f39c12" }
};

const HTML_HEADER = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>__SCHOOL_NAME__ - __TAGLINE__</title>
    <style>
        body { background-color: __BG_COLOR__; color: #111111; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; transition: background 0.3s; }
        .top-header { background-color: __HEADER_COLOR__; border-bottom: 3px solid __ACCENT_COLOR__; padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; }
        .logo-area { display: flex; align-items: center; gap: 15px; }
        .logo-circle { width: 65px; height: 65px; background: linear-gradient(135deg, __ACCENT_COLOR__, #0056b3); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px; color: #fff; border: 2px solid __ACCENT_COLOR__; box-shadow: 0 0 10px rgba(0,123,255,0.4); overflow: hidden; }
        .logo-circle img { width: 100%; height: 100%; object-fit: cover; }
        .title-text h1 { margin: 0; font-size: 24px; color: #111111; letter-spacing: 0.5px; }
        .title-text h2 { margin: 3px 0 0; font-size: 13px; color: #555555; font-weight: normal; }
        .header-btn { background: __ACCENT_COLOR__; color: white; padding: 8px 16px; border-radius: 4px; text-decoration: none; font-size: 13px; font-weight: bold; border: 1px solid rgba(0,0,0,0.1); transition: 0.2s; display: inline-block; }
        .header-btn:hover { opacity: 0.9; }
        .navbar { background-color: __HEADER_COLOR__; display: flex; justify-content: center; flex-wrap: wrap; border-bottom: 1px solid __ACCENT_COLOR__; box-shadow: 0 4px 6px rgba(0,0,0,0.1); position: relative; z-index: 100; }
        .nav-item { position: relative; }
        .navbar a { color: #333333; text-decoration: none; padding: 12px 18px; font-size: 14px; font-weight: 500; display: block; transition: background 0.2s, color 0.2s; }
        .navbar a:hover, .nav-item:hover > a { background-color: __ACCENT_COLOR__; color: #ffffff; }
        .dropdown-content { display: none; position: absolute; background-color: __HEADER_COLOR__; min-width: 230px; box-shadow: 0px 8px 16px rgba(0,0,0,0.2); z-index: 1; border: 1px solid __ACCENT_COLOR__; border-top: none; }
        .dropdown-content a { color: #333333; padding: 10px 15px; text-decoration: none; display: block; text-align: left; font-size: 13px; border-bottom: 1px dashed rgba(0,0,0,0.1); }
        .dropdown-content a:hover { background-color: __ACCENT_COLOR__; color: #ffffff; }
        .nav-item:hover .dropdown-content { display: block; }
        .main-container { max-width: 1100px; margin: 30px auto; padding: 0 15px; }
        .student-dashboard-wrapper { display: flex; gap: 20px; align-items: flex-start; }
        .sidebar-menu { width: 240px; background-color: __ACCENT_COLOR__; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .sidebar-item { display: flex; align-items: center; gap: 12px; padding: 12px 15px; color: white; text-decoration: none; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.1); transition: background 0.2s; }
        .sidebar-item:hover { background-color: rgba(0,0,0,0.1); }
        .profile-content-area { flex-grow: 1; background: #fff; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden; border: 1px solid #ddd; color: #111111; }
        .student-id-banner { background-color: __ACCENT_COLOR__; color: white; text-align: center; padding: 8px; font-size: 15px; font-weight: bold; letter-spacing: 0.5px; }
        .class-section-row { display: flex; background: #566573; color: white; font-weight: bold; font-size: 14px; text-align: center; }
        .class-col, .section-col { padding: 8px; width: 50%; }
        .class-col { background: __ACCENT_COLOR__; border-right: 1px solid #fff; }
        .student-photo-container { display: flex; justify-content: center; padding: 20px 0; background: #fff; }
        .student-avatar { width: 110px; height: 110px; border-radius: 50%; border: 4px solid __ACCENT_COLOR__; overflow: hidden; background: #ddd; display: flex; align-items: center; justify-content: center; font-size: 40px; color: #555; }
        .student-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .student-name-banner { background-color: __ACCENT_COLOR__; color: white; text-align: center; padding: 10px; font-size: 18px; font-weight: bold; letter-spacing: 1px; }
        .feature-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #ddd; border-top: 1px solid #ddd; }
        .feature-box { background: white; padding: 25px 10px; text-align: center; text-decoration: none; color: #111111; display: flex; flex-direction: column; align-items: center; gap: 10px; transition: background 0.2s; }
        .feature-box:hover { background: #f9f9f9; }
        .feature-icon { width: 45px; height: 45px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; color: white; box-shadow: 0 2px 5px rgba(0,0,0,0.15); }
        .feature-title { font-size: 12px; font-weight: bold; color: #111111; }
        .card { background-color: __HEADER_COLOR__; border: 1px solid #dddddd; border-radius: 8px; padding: 25px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); color: #111111; }
        .card h3 { color: #111111; border-bottom: 2px solid __ACCENT_COLOR__; padding-bottom: 8px; margin-top: 0; }
        .notice-header { background: __ACCENT_COLOR__; color: white; padding: 8px 15px; font-weight: bold; font-size: 14px; border-radius: 4px 4px 0 0; display: flex; justify-content: space-between; align-items: center; }
        .notice-body { background: __HEADER_COLOR__; border: 1px solid #dddddd; border-top: none; border-radius: 0 0 4px 4px; padding: 10px; max-height: 250px; overflow-y: auto; color: #111111; }
        .notice-item { padding: 10px; border-bottom: 1px dashed rgba(0,0,0,0.1); font-size: 13px; color: #333333; }
        .notice-item a { color: __ACCENT_COLOR__; text-decoration: none; font-weight: bold; display: block; margin-top: 3px; }
        .student-page-wrapper { display: flex; justify-content: center; align-items: center; padding: 50px 20px; }
        .login-box-custom { width: 100%; max-width: 480px; background: #fff; border-radius: 4px; box-shadow: 0 2px 15px rgba(0,0,0,0.1); overflow: hidden; border: 1px solid #ccc; color: #111111; }
        .card-top-header { padding: 15px 20px; display: flex; align-items: center; gap: 15px; border-bottom: 1px solid #eee; background: #fff; }
        .login-logo-circle { width: 45px; height: 45px; background: #e0f2f1; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; color: #00796b; border: 1px solid #b2dfdb; overflow: hidden; }
        .school-title h1 { margin: 0; font-size: 14px; color: #111111; font-weight: bold; }
        .school-title h2 { margin: 2px 0 0; font-size: 11px; color: #555555; letter-spacing: 0.5px; }
        .tab-title { background-color: __ACCENT_COLOR__; color: white; padding: 12px 20px; font-weight: bold; font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .form-content { background-color: #fff; padding: 25px; }
        .form-content label { display: block; margin-bottom: 6px; color: #111111; font-size: 12px; font-weight: bold; }
        .form-content select, .form-content input[type="text"], .form-content input[type="password"] { width: 100%; padding: 10px 12px; margin-bottom: 15px; background: #fff; border: 1px solid #ccc; color: #111111; border-radius: 4px; box-sizing: border-box; font-size: 14px; }
        .checkbox-group { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; font-size: 13px; color: #333333; }
        .checkbox-group input { width: auto; margin: 0; }
        .btn-container { display: flex; justify-content: flex-end; }
        .login-btn { background-color: __ACCENT_COLOR__; color: white; padding: 8px 24px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .forgot-pass { display: inline-block; color: #b71c1c; text-decoration: none; font-size: 13px; font-weight: bold; margin-top: 5px; }
        .msg { color: #d32f2f; background: #ffcdd2; padding: 10px; border-radius: 4px; text-align: center; margin-bottom: 15px; font-size: 13px; }
        .admin-page-wrapper { display: flex; justify-content: center; align-items: center; padding: 50px 20px; background: radial-gradient(circle, rgba(0,123,255,0.05) 0%, __BG_COLOR__ 100%); }
        .dashboard-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .dash-input { width: 100%; padding: 10px; margin-bottom: 15px; background: #ffffff; border: 1px solid #cccccc; color: #111111; border-radius: 4px; box-sizing: border-box; }
        .dash-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        .dash-table th, .dash-table td { border: 1px solid #dddddd; padding: 10px; text-align: left; font-size: 14px; color: #111111; }
        .dash-table th { background-color: __ACCENT_COLOR__; color: #ffffff; }
        .del-btn { background-color: #d32f2f; color: white; padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
        .site-footer { text-align: center; padding: 20px; color: #111111; font-size: 13px; border-top: 1px solid #dddddd; margin-top: 40px; background: __HEADER_COLOR__; }
        .site-footer a { color: #111111; text-decoration: none; font-weight: bold; }
        .site-footer a:hover { text-decoration: underline; }
        /* Mobile UI enhancement only: no content, routes, forms or data removed. */
        @keyframes dcFadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes dcFloat { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-3px); } }
        html { scroll-behavior:smooth; }
        body { min-height:100vh; overflow-x:hidden; -webkit-font-smoothing:antialiased; }
        .top-header { box-shadow:0 5px 18px rgba(0,0,0,.08); }
        .card,.profile-content-area,.login-box-custom { animation:dcFadeUp .42s ease both; }
        .header-btn,.login-btn,.sidebar-item,.feature-box { transition:transform .22s ease,box-shadow .22s ease,background-color .22s ease; }
        .header-btn:hover,.login-btn:hover { transform:translateY(-2px); box-shadow:0 7px 18px rgba(0,0,0,.14); }
        .feature-box:hover { transform:translateY(-3px); box-shadow:0 8px 20px rgba(0,0,0,.08); }
        .feature-icon { transition:transform .25s ease; }
        .feature-box:hover .feature-icon { transform:scale(1.08) rotate(3deg); }
        input:focus,select:focus,textarea:focus { outline:none; border-color:__ACCENT_COLOR__ !important; box-shadow:0 0 0 3px rgba(0,123,255,.10); }
        @media(max-width:768px){
          .top-header{position:relative;padding:12px 14px;gap:10px;align-items:center}
          .logo-area{gap:10px;min-width:0}.logo-circle{width:48px;height:48px;min-width:48px;font-size:16px}
          .title-text{min-width:0}.title-text h1{font-size:17px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.title-text h2{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .top-header>div:last-child{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.header-btn{padding:8px 10px;font-size:11px;border-radius:9px}
          .navbar{justify-content:flex-start;overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch;scrollbar-width:none}.navbar::-webkit-scrollbar{display:none}.navbar a{flex:0 0 auto;padding:11px 14px;font-size:12px;white-space:nowrap}.nav-item{flex:0 0 auto}
          .dropdown-content{position:fixed;left:10px;right:10px;min-width:0;max-height:65vh;overflow-y:auto;border-radius:12px;box-shadow:0 16px 35px rgba(0,0,0,.18)}
          .main-container{width:100%;box-sizing:border-box;margin:16px auto;padding:0 10px}.student-dashboard-wrapper{flex-direction:column;gap:12px}.sidebar-menu{width:100%;display:flex;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;border-radius:12px;position:sticky;top:8px;z-index:50;box-shadow:0 7px 18px rgba(0,0,0,.12)}.sidebar-menu::-webkit-scrollbar{display:none}.sidebar-item{flex:0 0 auto;min-height:42px;padding:11px 13px;font-size:12px;white-space:nowrap}
          .profile-content-area{width:100%;box-sizing:border-box;border-radius:13px}.student-id-banner,.student-name-banner{padding:11px 9px;font-size:14px}.class-section-row{font-size:12px}.class-col,.section-col{padding:8px 5px}.student-photo-container{padding:16px 0}.student-avatar{width:88px;height:88px;border-width:3px;font-size:32px}
          .feature-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.feature-box{padding:17px 7px;min-height:92px}.feature-icon{width:40px;height:40px;font-size:16px}.feature-title{font-size:11px;line-height:1.3}
          .card{padding:16px;border-radius:13px}.card h3{font-size:17px}.notice-header{border-radius:10px 10px 0 0;padding:10px 12px}.notice-body{max-height:280px;border-radius:0 0 10px 10px}
          .student-page-wrapper,.admin-page-wrapper{padding:24px 10px;min-height:calc(100vh - 150px);box-sizing:border-box}.login-box-custom{max-width:100%;border-radius:15px}.card-top-header{padding:13px 14px;gap:10px}.login-logo-circle{width:42px;height:42px;min-width:42px}.tab-title{padding:12px 14px;font-size:12px}.form-content{padding:17px 14px}.form-content select,.form-content input[type=text],.form-content input[type=password]{min-height:46px;padding:11px 12px;border-radius:10px;font-size:16px}.login-btn{width:100%;min-height:46px;border-radius:10px}.btn-container{display:block}
          .dashboard-grid{grid-template-columns:1fr;gap:13px}.dash-input{min-height:44px;font-size:16px;border-radius:9px}.dash-table{min-width:650px;font-size:12px}.dash-table th,.dash-table td{padding:8px}
          .main-container[style*="grid-template-columns"]{display:block!important}.main-container[style*="grid-template-columns"]>*{margin-bottom:14px}
          form[style*="display: flex"]{flex-direction:column!important;align-items:stretch!important;gap:9px!important}form[style*="display: flex"]>div{width:100%!important;flex-grow:1!important}
          .site-footer{margin-top:22px;padding:15px 10px;font-size:11px;line-height:1.5}
        }
        @media(max-width:420px){.main-container{padding:0 8px}.card{padding:13px}.feature-box{min-height:86px}}
        @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
    </style>
</head>
<body>
    <div class="top-header">
        <div class="logo-area">
            <div class="logo-circle">
                __LOGO_CONTENT__
            </div>
            <div class="title-text">
                <h1>__SCHOOL_NAME__</h1>
                <h2>__TAGLINE__</h2>
            </div>
        </div>
        <div>
            __HEADER_RIGHT_BUTTONS__
        </div>
    </div>

    <div class="navbar">
        <a href="/">Home</a>
        <div class="nav-item">
            <a href="#">Subjects ▾</a>
            <div class="dropdown-content">
                __SUBJECTS_DROPDOWN_LINKS__
            </div>
        </div>
        <div class="nav-item">
            <a href="#">Login ▾</a>
            <div class="dropdown-content">
                <a href="/login?type=student">Student Login</a>
                <a href="/login?type=teacher">Teacher Login</a>
                <a href="/login?type=admin">Admin Login</a>
            </div>
        </div>
        <a href="/contact">Contact</a>
        __ADMIN_NAV_LINK__
    </div>
`;

const HTML_FOOTER = `
    <div class="site-footer">
        <span>&copy; 2026 <a href="https://www.devscenter2017.com/" target="_blank" rel="noopener noreferrer">Dev.Center</a> | Software by <a href="https://www.nbd.dpdns.org/" target="_blank" rel="noopener noreferrer">NIGHT CLOUD</a></span>
    </div>
<script>document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('form').forEach(function(f){f.addEventListener('submit',function(){var b=f.querySelector('button[type="submit"]');if(b&&!b.disabled){b.style.opacity='.78';b.style.transform='scale(.99)';}});});});</script>
</body>
</html>
`;

function renderTemplate(contentBody, req) {
    let logoContent = portal_settings.logo_type === 'image'
        ? `<img src="${portal_settings.logo_url || '/logo.png'}" alt="Logo" onerror="this.onerror=null;this.src='/logo.png';">`
        : portal_settings.logo_text;

    let rightButtons = '';
    if (req.session && req.session.admin_logged) {
        rightButtons = `<span style="color: #111111; margin-right: 15px; font-size: 14px; font-weight: bold;">Admin Logged In</span>
                        <a href="/dashboard" class="header-btn">Dashboard</a>
                        <a href="/logout" class="header-btn" style="background-color: #d32f2f;">Logout</a>`;
    } else if (req.session && req.session.student_logged) {
        rightButtons = `<a href="/student_portal" class="header-btn">My Dashboard</a>
                        <a href="/logout" class="header-btn" style="background-color: #d32f2f;">Logout</a>`;
    } else if (req.session && req.session.teacher_logged) {
        rightButtons = `<a href="/teacher_portal" class="header-btn">Teacher Portal</a>
                        <a href="/logout" class="header-btn" style="background-color: #d32f2f;">Logout</a>`;
    } else {
        rightButtons = `<a href="/login?type=student" class="header-btn">Login</a>`;
    }

    // Public subject links: students/visitors can open subject sheets without logging in.
    let subLinks = subjects_list.map(sub => `<a href="/subject-sheets?subject=${encodeURIComponent(sub.name)}">${escapeHtml(sub.name)}</a>`).join('');
    let adminNavLink = (req.session && req.session.admin_logged) ? `<a href="/dashboard" style="color: #111111; font-weight: bold;">Dashboard</a>` : '';

    let html = HTML_HEADER
        .replace(/__SCHOOL_NAME__/g, portal_settings.school_name)
        .replace(/__TAGLINE__/g, portal_settings.tagline)
        .replace(/__BG_COLOR__/g, portal_settings.bg_color)
        .replace(/__HEADER_COLOR__/g, portal_settings.header_color)
        .replace(/__ACCENT_COLOR__/g, portal_settings.accent_color)
        .replace('__LOGO_CONTENT__', logoContent)
        .replace('__HEADER_RIGHT_BUTTONS__', rightButtons)
        .replace('__SUBJECTS_DROPDOWN_LINKS__', subLinks)
        .replace('__ADMIN_NAV_LINK__', adminNavLink);

    html += contentBody;
    html += HTML_FOOTER.replace(/__SCHOOL_NAME__/g, portal_settings.school_name);
    return html;
}

// Routes
app.get('/', (req, res) => {
    let noticeItemsHtml = notice_board.map(n => `
        <div class="notice-item">
            ${n.text}
            <a href="#">বিস্তারিত পড়ুন &raquo;</a>
        </div>
    `).join('');

    let body = `
    <div class="main-container" style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
        <div class="card">
            <h3>${portal_settings.home_title}</h3>
            <p style="color: #333333; line-height: 1.6; white-space: pre-line;">
                ${portal_settings.home_description}
            </p>
            <h4 style="color: #111111; margin-top: 20px;">${portal_settings.home_feature_title}</h4>
            <ul style="color: #333333; line-height: 1.8;">
                <li>${portal_settings.home_feature_1}</li>
                <li>${portal_settings.home_feature_2}</li>
                <li>${portal_settings.home_feature_3}</li>
            </ul>
        </div>
        <div>
            <div class="notice-header">
                <span>স্কুল নোটিশ বোর্ড</span>
                <span style="font-size: 12px; cursor: pointer;">সব দেখুন ...</span>
            </div>
            <div class="notice-body">
                ${noticeItemsHtml}
            </div>
        </div>
    </div>`;

    // Public subject section on the home page. No login is required to open a subject sheet.
    const publicSubjectCards = subjects_list.length ? subjects_list.map((sub, i) => {
        const count = uploaded_sheets.filter(x => String(x.subject || '').trim().toLowerCase() === String(sub.name || '').trim().toLowerCase()).length;
        return `<a href="/subject-sheets?subject=${encodeURIComponent(sub.name)}" style="text-decoration:none;color:inherit;">
            <div style="border:1px solid #ddd;border-radius:9px;padding:15px;background:#fff;transition:.15s;">
                <div style="font-size:12px;color:#777;">Subject ${i + 1}</div>
                <div style="font-size:17px;font-weight:bold;color:#00796b;margin-top:4px;">${escapeHtml(sub.name)}</div>
                <div style="font-size:12px;color:#666;margin-top:6px;">${count ? count + ' sheet' + (count === 1 ? '' : 's') + ' available' : 'No sheet yet'}</div>
                <div style="margin-top:10px;color:#00796b;font-size:12px;font-weight:bold;">📄 View Subject Sheets →</div>
            </div>
        </a>`;
    }).join('') : '<div style="color:#777;">No subjects have been added yet.</div>';

    body += `<div class="main-container" style="margin-top:0;"><div class="card">
        <h3 style="color:#00796b;margin-bottom:6px;">📚 Subjects & Subject Sheets</h3>
        <p style="color:#555;margin-top:0;">Student login is not required. Click any subject to view its available sheets and PDF files.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;">${publicSubjectCards}</div>
    </div></div>`;
    res.send(renderTemplate(body, req));
});

// Public Subject Sheet page — no student login required.
// Clicking a subject from the home page or Subjects menu opens that subject's own sheet page.
app.get('/subject-sheets', (req, res) => {
    const requestedSubject = String(req.query.subject || '').trim();
    if (!requestedSubject) {
        const subjectCards = subjects_list.length ? subjects_list.map((sub, i) => {
            const count = uploaded_sheets.filter(x => String(x.subject || '').trim().toLowerCase() === String(sub.name || '').trim().toLowerCase()).length;
            return `<a href="/subject-sheets?subject=${encodeURIComponent(sub.name)}" style="text-decoration:none;color:inherit;">
                <div class="card" style="padding:18px;margin-bottom:12px;cursor:pointer;">
                    <div style="font-size:12px;color:#777;">Subject ${i + 1}</div>
                    <div style="font-size:18px;font-weight:bold;color:#00796b;margin-top:4px;">${escapeHtml(sub.name)}</div>
                    <div style="font-size:13px;color:#666;margin-top:6px;">${count} sheet${count === 1 ? '' : 's'} available • Click to view</div>
                </div>
            </a>`;
        }).join('') : '<div class="card">No subjects have been added yet.</div>';
        return res.send(renderTemplate(`<div class="main-container" style="max-width:900px;"><div class="card"><h3 style="color:#00796b;">📚 Subjects & Sheets</h3><p style="color:#555;">Select a subject to view its uploaded sheets.</p>${subjectCards}</div></div>`, req));
    }

    const subjectRecord = subjects_list.find(sub => String(sub.name || '').trim().toLowerCase() === requestedSubject.toLowerCase());
    if (!subjectRecord) {
        return res.status(404).send(renderTemplate(`<div class="main-container" style="max-width:800px;"><div class="card"><h3 style="color:#c62828;">Subject not found</h3><p>This subject is not available.</p><a href="/" class="header-btn" style="display:inline-block;background:#00796b;">← Back to Home</a></div></div>`, req));
    }

    const subjectSheets = uploaded_sheets.filter(sheet => String(sheet.subject || '').trim().toLowerCase() === String(subjectRecord.name || '').trim().toLowerCase());
    const sheetRows = subjectSheets.length ? subjectSheets.map((sheet, index) => {
        const pdfUrl = '/sheets/' + encodeURIComponent(sheet.filename);
        return `<div style="background:#f7f9fa;border:1px solid #ddd;border-radius:8px;padding:18px;margin-bottom:12px;">
            <div style="font-size:16px;font-weight:bold;color:#111;">${index + 1}. ${escapeHtml(sheet.name)}</div>
            <div style="font-size:13px;color:#666;margin-top:5px;">Uploaded by: ${escapeHtml(sheet.teacher_name || 'Teacher')}</div>
            <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
                <a href="${pdfUrl}" target="_blank" rel="noopener noreferrer" class="header-btn" style="display:inline-block;background:#00796b;">📄 View PDF</a>
                <a href="${pdfUrl}" download class="header-btn" style="display:inline-block;background:#2e7d32;">⬇ Download PDF</a>
            </div>
        </div>`;
    }).join('') : '<div style="text-align:center;padding:35px;color:#777;background:#f7f7f7;border:1px solid #ddd;border-radius:8px;">No sheet has been uploaded for this subject yet.</div>';

    const body = `<div class="main-container" style="max-width:1000px;"><div class="card" style="padding:25px;">
        <div style="background:#00796b;color:#fff;border-radius:8px;padding:18px 20px;margin-bottom:20px;">
            <div style="font-size:12px;opacity:.9;">SUBJECT</div>
            <div style="font-size:24px;font-weight:bold;margin-top:3px;">${escapeHtml(subjectRecord.name)}</div>
            <div style="font-size:13px;margin-top:7px;opacity:.95;">Assigned Teacher: ${escapeHtml(subjectRecord.teacher || 'TBA')}</div>
        </div>
        <h3 style="margin:0 0 14px;color:#00796b;">📄 ${escapeHtml(subjectRecord.name)} Sheets</h3>
        ${sheetRows}
        <div style="margin-top:20px;"><a href="/" class="header-btn" style="display:inline-block;background:#555;">← Back to Home</a></div>
    </div></div>`;
    res.send(renderTemplate(body, req));
});

// Contact page — added without changing any existing admin or portal tools.
app.get('/contact', (req, res) => {
    const body = `
    <div class="main-container" style="max-width:800px;">
        <div class="card">
            <h3>যোগাযোগ</h3>
            <div style="font-size:15px; line-height:1.9; color:#333;">
                <p><strong>ঠিকানা:</strong><br>অভিযান # ১৪, কাজল ভিলা, সফিউদ্দিন রোড, টঙ্গী, গাজীপুর</p>
                <p><strong>অফিস:</strong><br><a href="tel:+8801680987196" style="color:${portal_settings.accent_color}; font-weight:bold;">01680-987196</a></p>
                <p><strong>WhatsApp:</strong><br><a href="https://wa.me/8801977230226" target="_blank" rel="noopener noreferrer" style="color:${portal_settings.accent_color}; font-weight:bold;">01977-230226</a></p>
            </div>
        </div>
    </div>`;
    res.send(renderTemplate(body, req));
});

app.get('/login', (req, res) => {
    let loginType = req.query.type || 'student';
    let msg = req.query.msg || '';

    let logoContent = portal_settings.logo_type === 'image'
        ? `<img src="${portal_settings.logo_url || '/logo.png'}" alt="Logo" onerror="this.onerror=null;this.src='/logo.png';">`
        : portal_settings.logo_text;

    let body = '';
    if (loginType === 'student') {
        let roomOptions = '';
        for(let i=1; i<=10; i++) roomOptions += `<option value="Room ${i}">Room ${i}</option>`;

        body = `
        <div class="student-page-wrapper">
            <div class="login-box-custom">
                <div class="card-top-header">
                    <div class="login-logo-circle">${logoContent}</div>
                    <div class="school-title">
                        <h1>${portal_settings.school_name}</h1>
                        <h2>PORTAL LOGIN (CLASS 5 - 8)</h2>
                    </div>
                </div>
                <div class="tab-title"><span>👤</span> STUDENT / PARENT'S LOGIN</div>
                <div class="form-content" style="background-color: #ffffdd;">
                    ${msg ? `<div class="msg">${msg}</div>` : ''}
                    <form method="POST">
                        <label>ROOM NUMBER:</label>
                        <select name="room">${roomOptions}</select>
                        <label>USER ID OR STUDENT ID NO:</label>
                        <input type="text" name="username" placeholder="Enter User ID or Student ID No" required>
                        <label>PASSWORD:</label>
                        <input type="password" name="password" placeholder="Enter Password" required>
                        <div class="checkbox-group">
                            <input type="checkbox" id="show-pass" onclick="togglePassword()">
                            <label for="show-pass" style="display:inline; margin:0; font-weight:normal; text-transform:none;">Show Password 👁</label>
                        </div>
                        <div class="btn-container">
                            <button type="submit" class="login-btn">Log In</button>
                        </div>
                    </form>
                    <a href="#" class="forgot-pass">Forgot Password?</a>
                </div>
            </div>
        </div>
        <script>
            function togglePassword() {
                var passInput = document.querySelector('input[name="password"]');
                passInput.type = passInput.type === "password" ? "text" : "password";
            }
        </script>`;
    } else if (loginType === 'teacher') {
        body = `
        <div class="student-page-wrapper">
            <div class="login-box-custom">
                <div class="card-top-header">
                    <div class="login-logo-circle">${logoContent}</div>
                    <div class="school-title">
                        <h1>${portal_settings.school_name}</h1>
                        <h2>TEACHER PORTAL LOGIN</h2>
                    </div>
                </div>
                <div class="tab-title" style="background-color: #00796b;"><span>👨‍🏫</span> TEACHER ACCOUNT LOGIN</div>
                <div class="form-content" style="background-color: #e0f2f1;">
                    ${msg ? `<div class="msg">${msg}</div>` : ''}
                    <form method="POST">
                        <label>TEACHER USER ID:</label>
                        <input type="text" name="username" placeholder="Enter Teacher ID" required>
                        <label>PASSWORD:</label>
                        <input type="password" name="password" placeholder="Enter Password" required>
                        <div class="checkbox-group">
                            <input type="checkbox" id="show-pass" onclick="togglePassword()">
                            <label for="show-pass" style="display:inline; margin:0; font-weight:normal; text-transform:none;">Show Password 👁</label>
                        </div>
                        <div class="btn-container">
                            <button type="submit" class="login-btn" style="background-color: #00796b;">Teacher Log In</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        <script>
            function togglePassword() {
                var passInput = document.querySelector('input[name="password"]');
                passInput.type = passInput.type === "password" ? "text" : "password";
            }
        </script>`;
    } else {
        body = `
        <div class="admin-page-wrapper">
            <div class="login-box-custom">
                <div class="card-top-header">
                    <div class="login-logo-circle">${logoContent}</div>
                    <div class="school-title">
                        <h1>${portal_settings.school_name}</h1>
                        <h2>ADMIN LOGIN</h2>
                    </div>
                </div>
                <div class="tab-title" style="background-color: ${portal_settings.accent_color};"><span>👤</span> ADMIN LOGIN PANEL</div>
                <div class="form-content">
                    ${msg ? `<div class="msg">${msg}</div>` : ''}
                    <form method="POST">
                        <label>Username:</label>
                        <input type="text" name="username" placeholder="Username" required style="background:#fff; color:#333; border:1px solid #ccc;">
                        <label>Password:</label>
                        <input type="password" name="password" placeholder="Password" required style="background:#fff; color:#333; border:1px solid #ccc;">
                        <div class="checkbox-group">
                            <input type="checkbox" id="show-pass" onclick="toggleAdminPassword()">
                            <label for="show-pass" style="display:inline; margin:0; font-weight:normal; text-transform:none;">Show Password 👁</label>
                        </div>
                        <div class="btn-container">
                            <button type="submit" class="login-btn">Log In</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        <script>
            function toggleAdminPassword() {
                var passInput = document.querySelector('input[name="password"]');
                passInput.type = passInput.type === "password" ? "text" : "password";
            }
        </script>`;
    }
    res.send(renderTemplate(body, req));
});

app.post('/login', (req, res) => {
    let loginType = req.query.type || 'student';
    let { username, password, room } = req.body;
    let msg = '';

    if (loginType === 'admin') {
        if (String(username || '').trim() === ADMIN_USER && String(password || '').trim() === ADMIN_PASS) {
            req.session.admin_logged = true;
            return req.session.save(() => res.redirect('/dashboard'));
        } else {
            msg = 'Invalid Username or Password!';
        }
    } else if (loginType === 'teacher') {
        let loginTeacherId = String(username || '').trim();
        let loginTeacherPass = String(password || '').trim();
        let teacherFound = teachers_list.find(t => String(t.id == null ? '' : t.id).trim() === loginTeacherId && String(t.pass == null ? '' : t.pass).trim() === loginTeacherPass);
        if (teacherFound) {
            req.session.teacher_logged = teacherFound.id;
            return req.session.save(() => res.redirect('/teacher_portal'));
        } else {
            msg = 'Incorrect Teacher ID or Password!';
        }
    } else {
        const loginUser = String(username || '').trim();
        const loginPass = String(password || '').trim();
        const loginRoom = String(room || '').trim().toLowerCase();
        let studentFound = students_list.find(s => {
            const sid = String(s.id == null ? '' : s.id).trim();
            const sno = String(s.student_no == null ? '' : s.student_no).trim();
            const spass = String(s.pass == null ? '' : s.pass).trim();
            return (sid === loginUser || sno === loginUser) && spass === loginPass;
        });
        if (studentFound) {
            const studentRoom = String(studentFound.room == null ? '' : studentFound.room).trim().toLowerCase();
            // Existing accounts without a room remain usable; otherwise compare case-insensitively.
            if (!studentRoom || !loginRoom || studentRoom === loginRoom) {
                req.session.student_logged = String(studentFound.id);
                return req.session.save(() => res.redirect('/student_portal'));
            } else {
                msg = `Incorrect Room! This student belongs to ${studentFound.room}.`;
            }
        } else {
            msg = 'Incorrect User ID, Student ID Number, or Password!';
        }
    }
    res.redirect(`/login?type=${loginType}&msg=${encodeURIComponent(msg)}`);
});

// Teacher Portal
app.get('/teacher_portal', (req, res) => {
    if (!req.session.teacher_logged) return res.redirect('/login?type=teacher');
    let teacher = teachers_list.find(t => t.id === req.session.teacher_logged);
    if (!teacher) return res.redirect('/logout');

    let subTab = req.query.subtab || 'dashboard';
    let msg = req.query.msg || '';
    let body = '';

    if (subTab === 'upload_sheet') {
        const teacherSubjects = normalizeTeacherSubjects(teacher);
        const selectedSubject = teacherSubjects.includes(String(req.query.subject || '').trim()) ? String(req.query.subject).trim() : (teacherSubjects[0] || '');
        const teacherSheets = uploaded_sheets.filter(x => String(x.teacher_id) === String(teacher.id));
        const subjectOptions = teacherSubjects.length ? teacherSubjects.map(s => `<option value="${escapeHtml(s)}" ${selectedSubject === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('') : '<option value="">-- No Subject Assigned --</option>';
        const uploadedRows = teacherSheets.length ? teacherSheets.map((sheet, i) => `<tr><td style="text-align:center;">${i+1}</td><td><b>${escapeHtml(sheet.name)}</b></td><td>${escapeHtml(sheet.subject)}</td><td>${escapeHtml(sheet.uploaded_at ? new Date(sheet.uploaded_at).toLocaleString() : '')}</td><td style="text-align:center;white-space:nowrap;"><a href="/teacher_portal/sheets/view?id=${encodeURIComponent(sheet.id)}" class="header-btn" style="display:inline-block;padding:7px 12px;background:#00796b;margin-right:5px;">View Sheet</a><form method="POST" action="/teacher_portal/delete_sheet" style="display:inline;" onsubmit="return confirm('Delete this sheet? This cannot be undone.');"><input type="hidden" name="sheet_id" value="${escapeHtml(sheet.id)}"><button type="submit" class="del-btn" style="border:none;cursor:pointer;padding:7px 12px;">🗑 Delete</button></form></td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center;padding:25px;color:#777;">No sheets uploaded yet.</td></tr>';
        body = `
        <div class="main-container" style="max-width:1100px;">
            <div class="student-dashboard-wrapper">
                <div class="sidebar-menu" style="background-color:#00796b;">
                    <a href="/teacher_portal" class="sidebar-item">👨‍🏫 Teacher Dashboard</a>
                    <a href="/teacher_portal?subtab=upload_marks" class="sidebar-item">📝 Upload Marks / Results</a>
                    <a href="/teacher_portal?subtab=upload_sheet" class="sidebar-item" style="background:rgba(0,0,0,0.1);font-weight:bold;">📄 Upload Subject Sheet</a>
                    <a href="#" class="sidebar-item">📋 Attendance Sheet</a>
                    <a href="#" class="sidebar-item">📢 Notice Board</a>
                </div>
                <div class="profile-content-area">
                    <div class="student-id-banner" style="background-color:#00796b;">Upload Subject Sheet / PDF</div>
                    <div style="padding:25px;">
                        ${msg ? `<div style="background:#d4edda;color:#155724;padding:10px;border-radius:4px;margin-bottom:15px;font-weight:bold;">${escapeHtml(msg)}</div>` : ''}
                        <div style="background:#f4f4f4;border:1px solid #e5e5e5;padding:18px;border-radius:7px;max-width:760px;">
                            <form method="POST" action="/teacher_portal/upload_sheet" enctype="multipart/form-data">
                                <label style="display:block;margin-bottom:6px;font-size:12px;font-weight:bold;">Sheet Name:</label>
                                <input type="text" name="sheet_name" class="dash-input" placeholder="e.g. Bangla-I Suggestion Sheet" required>
                                <label style="display:block;margin-bottom:6px;font-size:12px;font-weight:bold;">Select Subject:</label>
                                <select name="subject" class="dash-input" required>${subjectOptions}</select>
                                <label style="display:block;margin-bottom:6px;font-size:12px;font-weight:bold;">Upload PDF:</label>
                                <input type="file" name="sheet_pdf" accept="application/pdf,.pdf" required style="width:100%;padding:10px;background:#fff;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;margin-bottom:8px;">
                                <div style="font-size:12px;color:#777;margin-bottom:15px;">PDF only. Maximum file size: 20 MB.</div>
                                <button type="submit" class="header-btn" style="cursor:pointer;border:none;background:#00796b;">Upload &amp; Submit</button>
                            </form>
                        </div>
                        <div style="margin-top:28px;">
                            <h3 style="color:#00796b;margin-top:0;">My Uploaded Sheets</h3>
                            <div style="overflow-x:auto;"><table class="dash-table"><tr><th>SI</th><th>Sheet Name</th><th>Subject</th><th>Uploaded</th><th>Action</th></tr>${uploadedRows}</table></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    } else if (subTab === 'upload_marks') {
        let selectedClass = req.query.class || '';
        let selectedRoom = req.query.room || 'Room 1';
        let teacherSubjects = normalizeTeacherSubjects(teacher);
        let requestedSubject = String(req.query.subject || '').trim();
        let selectedSubject = teacherSubjects.length > 1
            ? (teacherSubjects.includes(requestedSubject) ? requestedSubject : teacherSubjects[0])
            : (teacherSubjects[0] || '');
        let selectedShift = req.query.shift || '';
        let activeExam = getActiveExam();

        let classOptions = '';
        for (let i = 1; i <= 10; i++) {
            const cName = `Class ${i}`;
            classOptions += `<option value="${cName}" ${selectedClass === cName ? 'selected' : ''}>${cName}</option>`;
        }

        
        let roomOptions = '';
        for(let i=1; i<=10; i++) {
            let rName = `Room ${i}`;
            roomOptions += `<option value="${rName}" ${selectedRoom === rName ? 'selected' : ''}>${rName}</option>`;
        }

        // Get students sorted by roll number for the selected room
        let roomStudents = students_list
            .filter(s =>
                (!selectedClass || String(s.class || '') === String(selectedClass)) &&
                (!selectedRoom || String(s.room || '') === String(selectedRoom)) &&
                (!selectedShift || String(s.shift || 'Day') === String(selectedShift)) &&
                studentHasSubject(s, selectedSubject)
            )
            .sort((a, b) => parseInt(a.roll) - parseInt(b.roll));

        let studentMarkRows = '';
        if (roomStudents.length > 0) {
            roomStudents.forEach(st => {
                let examSubjectMarks = activeExam ? getExamMarks(activeExam.id, selectedRoom, selectedSubject) : {};
                let existingMark = examSubjectMarks[st.roll] || { written: '', mcq: '' };

                studentMarkRows += `
                <tr>
                    <td style="text-align:center; font-weight:bold;">${st.roll}</td>
                    <td style="font-weight:bold;">${st.name}</td>
                    <td>${st.student_no}</td>
                    <td><input type="number" name="marks_${st.roll}_written" value="${existingMark.written}" class="dash-input" style="margin-bottom:0;" placeholder="0-100" min="0" max="100"></td>
                    <td><input type="number" name="marks_${st.roll}_mcq" value="${existingMark.mcq}" class="dash-input" style="margin-bottom:0;" placeholder="0-50" min="0" max="50"></td>
                </tr>`;
            });
        } else {
            studentMarkRows = `<tr><td colspan="5" style="text-align:center; color:#555;">No students found registered in ${selectedRoom}.</td></tr>`;
        }

        body = `
        <div class="main-container">
            <div class="student-dashboard-wrapper">
                <div class="sidebar-menu" style="background-color: #00796b;">
                    <a href="/teacher_portal" class="sidebar-item">👨‍🏫 Teacher Dashboard</a>
                    <a href="/teacher_portal?subtab=upload_marks" class="sidebar-item" style="background: rgba(0,0,0,0.1); font-weight: bold;">📝 Upload Marks / Results</a>
                    <a href="#" class="sidebar-item">📋 Attendance Sheet</a>
                    <a href="#" class="sidebar-item">📢 Notice Board</a>
                </div>
                <div class="profile-content-area">
                    <div class="student-id-banner" style="background-color: #00796b;">${activeExam ? `${activeExam.title} - Upload Marks & Results` : 'Marks & Results'}</div>
                    ${activeExam ? `<div style="margin:0; padding:10px 15px; background:#e8f5e9; color:#1b5e20; font-weight:bold; text-align:center;">🟢 Active Exam: ${activeExam.title}</div>` : `<div style="margin:0; padding:10px 15px; background:#fff3cd; color:#856404; font-weight:bold; text-align:center;">⚠️ No examination is currently active. Admin must start an exam before marks can be uploaded.</div>`}
                    <div style="padding: 25px;">
                        ${msg ? `<div style="background:#d4edda; color:#155724; padding:10px; border-radius:4px; margin-bottom:15px; font-weight:bold;">${msg}</div>` : ''}
                        
                        <form method="GET" action="/teacher_portal" style="display: flex; gap: 15px; align-items: flex-end; margin-bottom: 25px; background: rgba(0,0,0,0.03); padding: 15px; border-radius: 6px;">
                            <input type="hidden" name="subtab" value="upload_marks">
                            <div style="flex-grow: 1;">
                                <div style="flex-grow:1;">
                            <label style="display:block;margin-bottom:5px;font-size:12px;font-weight:bold;">Select Class:</label>
                            <select name="class" class="dash-input" onchange="this.form.submit()">
                                <option value="">All Classes</option>
                                ${classOptions}
                            </select>
                        </div>
                        <label style="display:block; margin-bottom:5px; font-size:12px; font-weight:bold;">Select Room:</label>
                                <select name="room" class="dash-input" style="margin-bottom:0;" onchange="this.form.submit()">${roomOptions}</select><div style="flex-grow:1;">
                            <label style="display:block;margin-bottom:5px;font-size:12px;font-weight:bold;">Select Shift:</label>
                            <select name="shift" class="dash-input" onchange="this.form.submit()">
                                <option value="">All Shifts</option>
                                <option value="Day" ${selectedShift === 'Day' ? 'selected' : ''}>Day</option>
                                <option value="Morning" ${selectedShift === 'Morning' ? 'selected' : ''}>Morning</option>
                            </select>
                        </div>
                        
                            </div>
                            <div style="flex-grow: 1;">
                                ${teacherSubjects.length > 1 ? `
                                <label style="display:block; margin-bottom:5px; font-size:12px; font-weight:bold;">Select Subject:</label>
                                <select name="subject" class="dash-input" style="margin-bottom:0;" onchange="this.form.submit()">
                                    ${teacherSubjects.map(s => `<option value="${s}" ${selectedSubject === s ? 'selected' : ''}>${s}</option>`).join('')}
                                </select>` : `
                                <label style="display:block; margin-bottom:5px; font-size:12px; font-weight:bold;">Subject:</label>
                                <input type="text" class="dash-input" value="${selectedSubject || 'No Subject Assigned'}" readonly style="margin-bottom:0; background:#eee;">
                                <input type="hidden" name="subject" value="${selectedSubject}">`}
                            </div>
                        </form>

                        <form method="POST" action="/teacher_portal/save_marks">
                            <input type="hidden" name="room" value="${selectedRoom}">
                            <input type="hidden" name="subject" value="${selectedSubject}">
                            <input type="hidden" name="exam_id" value="${activeExam ? activeExam.id : ''}">
                            
                            <table class="dash-table">
                                <tr>
                                    <th style="width: 70px; text-align: center;">Roll</th>
                                    <th>Student Name</th>
                                    <th>Student ID No</th>
                                    <th style="width: 130px;">Written Mark</th>
                                    <th style="width: 130px;">MCQ Mark</th>
                                </tr>
                                ${studentMarkRows}
                            </table>
                            ${roomStudents.length > 0 && activeExam ? `<button type="submit" class="header-btn" style="cursor:pointer; border:none; margin-top:20px; background-color:#00796b; padding: 12px 25px; font-size:14px;">Save Marks for ${selectedRoom} - ${activeExam.title}</button>` : ''}
                        </form>
                    </div>
                </div>
            </div>
        </div>`;
    } else {
        body = `
        <div class="main-container">
            <div class="student-dashboard-wrapper">
                <div class="sidebar-menu" style="background-color: #00796b;">
                    <a href="/teacher_portal" class="sidebar-item" style="background: rgba(0,0,0,0.1); font-weight: bold;">👨‍🏫 Teacher Dashboard</a>
                    <a href="/teacher_portal?subtab=upload_marks" class="sidebar-item">📝 Upload Marks / Results</a>
                    <a href="/teacher_portal?subtab=upload_sheet" class="sidebar-item">📄 Upload Subject Sheet</a>
                    <a href="#" class="sidebar-item">📋 Attendance Sheet</a>
                    <a href="#" class="sidebar-item">📢 Notice Board</a>
                </div>
                <div class="profile-content-area">
                    <div class="student-id-banner" style="background-color: #00796b;">Teacher Portal ID # ${teacher.id}</div>
                    <div class="class-section-row">
                        <div class="class-col" style="background-color: #00897b;">Subject: ${getTeacherSubjects(teacher).join(', ') || 'No Subject Assigned'}</div>
                        <div class="section-col" style="background: #00695c;">Phone: ${teacher.phone}</div>
                    </div>
                    <div class="student-photo-container">
                        <div class="student-avatar" style="border-color: #00796b; color: #00796b;">👨‍🏫</div>
                    </div>
                    <div class="student-name-banner" style="background-color: #00796b;">${teacher.name}</div>
                    <div style="padding: 25px; color: #111111;">
                        <h3 style="color: #00796b; margin-top:0;">Welcome, Professor ${teacher.name}!</h3>
                        <p style="font-size: 14px; line-height: 1.6;">
                            You are successfully logged into the official ${portal_settings.school_name} Teacher Management Portal. From here you can check your assigned subject${getTeacherSubjects(teacher).length > 1 ? 's' : ''} (<strong>${getTeacherSubjects(teacher).join(', ') || 'None'}</strong>), select rooms, and upload student marks sequentially by roll number.
                        </p>
                        <div style="margin-top:15px;display:flex;gap:10px;flex-wrap:wrap;">
                            <a href="/teacher_portal?subtab=upload_marks" class="header-btn" style="background-color:#00796b;display:inline-block;">Go to Mark Upload Panel &raquo;</a>
                            <a href="/teacher_portal?subtab=upload_sheet" class="header-btn" style="background-color:#00897b;display:inline-block;">Upload Subject Sheet / PDF &raquo;</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }
    res.send(renderTemplate(body, req));
});

app.post('/teacher_portal/save_marks', (req, res) => {
    if (!req.session.teacher_logged) return res.redirect('/login?type=teacher');
    let { room, subject, exam_id, class: selectedClass, shift: selectedShift } = req.body;
    let activeExam = getActiveExam();
    const teacher = teachers_list.find(t => t.id === req.session.teacher_logged);
    const teacherSubjects = normalizeTeacherSubjects(teacher);
    subject = String(subject || '').trim();

    if (!teacher || !subject || !teacherSubjects.includes(subject)) {
        return res.redirect('/teacher_portal?subtab=upload_marks&msg=' + encodeURIComponent('You can only upload marks for your assigned subject(s).'));
    }

    if (!activeExam || exam_id !== activeExam.id) {
        return res.redirect('/teacher_portal?subtab=upload_marks&msg=' + encodeURIComponent('No active exam. Admin must start an exam before marks can be uploaded.'));
    }

    let subjectMarks = getExamMarks(activeExam.id, room, subject);

    let roomStudents = students_list.filter(s =>
        String(s.room || '') === String(room || '') &&
        (!selectedClass || String(s.class || '') === String(selectedClass)) &&
        (!selectedShift || String(s.shift || 'Day') === String(selectedShift)) &&
        studentHasSubject(s, subject)
    );
    roomStudents.forEach(st => {
        let written = parseFloat(req.body[`marks_${st.roll}_written`]) || 0;
        let mcq = parseFloat(req.body[`marks_${st.roll}_mcq`]) || 0;
        let total = written + mcq;
        let grade = "F";
        if (total >= 80) grade = "A+";
        else if (total >= 70) grade = "A";
        else if (total >= 60) grade = "A-";
        else if (total >= 50) grade = "B";
        else if (total >= 40) grade = "C";
        else if (total >= 33) grade = "D";

        subjectMarks[st.roll] = { written, mcq, total, grade };
    });

    savePortalData();
    res.redirect(`/teacher_portal?subtab=upload_marks&class=${encodeURIComponent(selectedClass || '')}&room=${encodeURIComponent(room)}&shift=${encodeURIComponent(selectedShift || '')}&subject=${encodeURIComponent(subject)}&msg=${encodeURIComponent('Marks successfully uploaded and saved for ' + room + '!')}`);
});

// Teacher Subject Sheet / PDF Upload
app.get('/teacher_portal/sheets/view', (req, res) => {
    if (!req.session.teacher_logged && !req.session.student_logged) return res.redirect('/login?type=student');
    const id = String(req.query.id || '').trim();
    const sheet = uploaded_sheets.find(x => x.id === id);
    if (!sheet) return res.status(404).send(renderTemplate('<div class="main-container"><div class="card"><h3>Sheet not found</h3><p>The requested sheet is no longer available.</p></div></div>', req));

    const isTeacher = !!req.session.teacher_logged;
    if (isTeacher) {
        const teacher = teachers_list.find(t => t.id === req.session.teacher_logged);
        if (!teacher || !getTeacherSubjects(teacher).includes(sheet.subject)) {
            return res.status(403).send(renderTemplate('<div class="main-container"><div class="card"><h3>Access denied</h3><p>You are not assigned to this subject.</p></div></div>', req));
        }
    }

    const pdfUrl = '/sheets/' + encodeURIComponent(sheet.filename);
    const body = `
    <div class="main-container" style="max-width:1000px;">
        <div class="card" style="padding:0;overflow:hidden;">
            <div style="background:#00796b;color:#fff;padding:14px 18px;font-weight:bold;font-size:17px;">📄 Subject Sheet</div>
            <div style="padding:22px;">
                <div style="background:#f4f6f9;border:1px solid #ddd;border-radius:8px;padding:16px;margin-bottom:18px;">
                    <div style="font-size:18px;font-weight:bold;color:#111;margin-bottom:8px;">${escapeHtml(sheet.name)}</div>
                    <div style="font-size:13px;color:#555;"><b>Subject:</b> ${escapeHtml(sheet.subject)}</div>
                    <div style="font-size:13px;color:#555;margin-top:4px;"><b>Uploaded by:</b> ${escapeHtml(sheet.teacher_name || 'Teacher')}</div>
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:15px;">
                    <a href="${pdfUrl}" target="_blank" rel="noopener noreferrer" class="header-btn" style="display:inline-block;background:#00796b;">View PDF</a>
                    <a href="${pdfUrl}" download class="header-btn" style="display:inline-block;background:#555;">Download PDF</a>
                    <a href="/student_portal?tab=subjects" class="header-btn" style="display:inline-block;background:#2e7d32;">Back to Subjects</a>
                </div>
                <iframe src="${pdfUrl}#toolbar=1&navpanes=0" title="${escapeHtml(sheet.name)}" style="width:100%;height:720px;border:1px solid #ccc;border-radius:6px;background:#fff;"></iframe>
            </div>
        </div>
    </div>`;
    res.send(renderTemplate(body, req));
});

app.post('/teacher_portal/upload_sheet', parseTeacherSheetUpload, (req, res) => {
    if (!req.session.teacher_logged) return res.redirect('/login?type=teacher');
    const teacher = teachers_list.find(t => t.id === req.session.teacher_logged);
    if (!teacher) return res.redirect('/logout');

    const sheetName = String(req.body.sheet_name || '').trim();
    const subject = String(req.body.subject || '').trim();
    const file = req.teacherSheetFile;
    const teacherSubjects = normalizeTeacherSubjects(teacher);

    if (!sheetName) return res.redirect('/teacher_portal?subtab=upload_sheet&msg=' + encodeURIComponent('Please enter a sheet name.'));
    if (!subject || !teacherSubjects.includes(subject)) return res.redirect('/teacher_portal?subtab=upload_sheet&msg=' + encodeURIComponent('Please select one of your assigned subjects.'));
    if (!file || !file.buffer || !file.buffer.length) return res.redirect('/teacher_portal?subtab=upload_sheet&msg=' + encodeURIComponent('Please select a PDF file.'));

    const ext = path.extname(file.originalname || '').toLowerCase();
    const looksPdf = file.mimetype === 'application/pdf' || ext === '.pdf' || file.buffer.slice(0, 5).toString('ascii') === '%PDF-';
    if (!looksPdf || file.buffer.slice(0, 5).toString('ascii') !== '%PDF-') {
        return res.redirect('/teacher_portal?subtab=upload_sheet&msg=' + encodeURIComponent('Only valid PDF files are allowed.'));
    }
    if (file.buffer.length > 20 * 1024 * 1024) {
        return res.redirect('/teacher_portal?subtab=upload_sheet&msg=' + encodeURIComponent('PDF is too large. Maximum file size is 20 MB.'));
    }

    const id = 'sheet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    const safeBase = sheetName.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'subject_sheet';
    const filename = `${id}_${safeBase}.pdf`;
    const filePath = path.join(SHEETS_DIR, filename);
    try {
        fs.writeFileSync(filePath, file.buffer);
    } catch (err) {
        console.error('[Sheet Upload] save error:', err.message);
        return res.redirect('/teacher_portal?subtab=upload_sheet&msg=' + encodeURIComponent('Could not save the PDF. Please check the public/sheets folder permissions.'));
    }

    uploaded_sheets.unshift({
        id,
        name: sheetName,
        subject,
        filename,
        teacher_id: teacher.id,
        teacher_name: teacher.name,
        uploaded_at: new Date().toISOString()
    });
    savePortalData();
    res.redirect('/teacher_portal?subtab=upload_sheet&msg=' + encodeURIComponent('Sheet uploaded successfully!'));
});

// Teacher can delete only their own uploaded sheet. The PDF file and portal-data record are both removed.
app.post('/teacher_portal/delete_sheet', express.urlencoded({ extended: true }), (req, res) => {
    if (!req.session.teacher_logged) return res.redirect('/login?type=teacher');
    const teacher = teachers_list.find(t => String(t.id) === String(req.session.teacher_logged));
    if (!teacher) return res.redirect('/logout');

    const sheetId = String(req.body.sheet_id || '').trim();
    if (!sheetId) return res.redirect('/teacher_portal?subtab=upload_sheet&msg=' + encodeURIComponent('Sheet ID is missing.'));

    const sheetIndex = uploaded_sheets.findIndex(x => String(x.id) === sheetId && String(x.teacher_id) === String(teacher.id));
    if (sheetIndex === -1) {
        return res.redirect('/teacher_portal?subtab=upload_sheet&msg=' + encodeURIComponent('Sheet not found or you are not allowed to delete it.'));
    }

    const sheet = uploaded_sheets[sheetIndex];
    try {
        if (sheet.filename) {
            const filePath = path.join(SHEETS_DIR, path.basename(sheet.filename));
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.error('[Sheet Delete] file delete error:', err.message);
        return res.redirect('/teacher_portal?subtab=upload_sheet&msg=' + encodeURIComponent('Could not delete the PDF file.'));
    }

    uploaded_sheets.splice(sheetIndex, 1);
    savePortalData();
    res.redirect('/teacher_portal?subtab=upload_sheet&msg=' + encodeURIComponent('Sheet deleted successfully.'));
});

// Student/teacher-visible sheet PDF endpoint. Static public/sheets also serves these files directly.
app.get('/teacher_portal/sheets/pdf/:filename', (req, res) => {
    const filename = path.basename(req.params.filename || '');
    const sheet = uploaded_sheets.find(x => x.filename === filename);
    if (!sheet) return res.status(404).send('PDF not found.');
    if (!req.session.teacher_logged && !req.session.student_logged) return res.redirect('/login?type=student');
    res.sendFile(path.join(SHEETS_DIR, filename));
});

// Student-specific Subject Sheet page.
// Each subject opens on its own page and shows the subject name, uploaded sheet name(s),
// and a View PDF button. Students can only access sheets belonging to a subject listed
// in the portal's Subjects & Teachers section.
app.get('/student_portal/sheets', (req, res) => {
    if (!req.session.student_logged) return res.redirect('/login?type=student');

    const requestedSubject = String(req.query.subject || '').trim();
    if (!requestedSubject) {
        return res.redirect('/student_portal?tab=subjects');
    }

    const subjectRecord = subjects_list.find(sub =>
        String(sub.name || '').trim().toLowerCase() === requestedSubject.toLowerCase()
    );
    if (!subjectRecord) {
        return res.status(404).send(renderTemplate(`
            <div class="main-container" style="max-width:900px;">
                <div class="card" style="padding:25px;">
                    <h3 style="color:#00796b;">Subject not found</h3>
                    <p>The requested subject is not available.</p>
                    <a href="/student_portal?tab=subjects" class="header-btn" style="display:inline-block;background:#00796b;">Back to Subjects</a>
                </div>
            </div>`, req));
    }

    const student = students_list.find(s => String(s.id) === String(req.session.student_logged));
    if (!student) return res.redirect('/logout');
    if (!studentHasSubject(student, subjectRecord.name)) {
        return res.status(403).send(renderTemplate(`
            <div class="main-container" style="max-width:900px;"><div class="card">
                <h3 style="color:#c62828;">Subject not available for this student</h3>
                <p>This religion subject is not assigned to your student profile.</p>
                <a href="/student_portal?tab=subjects" class="header-btn">Back to Subjects</a>
            </div></div>`, req));
    }

    const subjectSheets = uploaded_sheets.filter(sheet =>
        String(sheet.subject || '').trim().toLowerCase() === String(subjectRecord.name || '').trim().toLowerCase()
    );

    const sheetRows = subjectSheets.length ? subjectSheets.map((sheet, index) => {
        const pdfUrl = '/sheets/' + encodeURIComponent(sheet.filename);
        return `
            <div style="background:#f7f9fa;border:1px solid #ddd;border-radius:8px;padding:18px;margin-bottom:12px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap;">
                    <div>
                        <div style="font-size:16px;font-weight:bold;color:#111;">${index + 1}. ${escapeHtml(sheet.name)}</div>
                        <div style="font-size:12px;color:#666;margin-top:5px;">Uploaded by: ${escapeHtml(sheet.teacher_name || 'Teacher')}</div>
                    </div>
                    <a href="${pdfUrl}" target="_blank" rel="noopener noreferrer" class="header-btn" style="display:inline-block;background:#00796b;">📄 View PDF</a>
                </div>
            </div>`;
    }).join('') : `
        <div style="text-align:center;padding:35px;color:#777;background:#f7f7f7;border:1px solid #ddd;border-radius:8px;">
            No sheet has been uploaded for this subject yet.
        </div>`;

    const body = `
    <div class="main-container" style="max-width:1000px;">
        <div class="student-dashboard-wrapper">
            <div class="sidebar-menu">
                <a href="/student_portal?tab=profile" class="sidebar-item">🏠 Dashboard Profile</a>
                <a href="/student_portal?tab=subjects" class="sidebar-item" style="background:rgba(0,0,0,0.1);font-weight:bold;">📚 My Subjects & Teachers</a>
                <a href="/student_portal?tab=results" class="sidebar-item">📊 My Result & PDF Sheet</a>
                <a href="/student_portal?tab=change_password" class="sidebar-item">🔐 Change Password</a>
                <a href="#" class="sidebar-item">💵 Tuition Fees</a>
                <a href="#" class="sidebar-item">🌐 Online Live Class</a>
                <a href="#" class="sidebar-item">📝 Online Exam</a>
                <a href="#" class="sidebar-item">💻 E-Learning</a>
                <a href="#" class="sidebar-item">📋 Homeworks</a>
                ${getActiveExam() ? '<a href="/student_portal?tab=admit_card" class="sidebar-item">💳 Admit Card</a>' : ''}
            </div>
            <div class="profile-content-area">
                <div class="student-id-banner">Subject Sheet</div>
                <div style="padding:25px;">
                    <div style="background:#00796b;color:#fff;border-radius:8px;padding:18px 20px;margin-bottom:20px;">
                        <div style="font-size:12px;opacity:.9;">SUBJECT</div>
                        <div style="font-size:23px;font-weight:bold;margin-top:3px;">${escapeHtml(subjectRecord.name)}</div>
                        <div style="font-size:13px;margin-top:8px;opacity:.95;">Assigned Teacher: ${escapeHtml(subjectRecord.teacher || 'TBA')}</div>
                    </div>

                    <h3 style="margin:0 0 14px;color:#00796b;">📄 ${escapeHtml(subjectRecord.name)} Sheets</h3>
                    ${sheetRows}

                    <div style="margin-top:20px;">
                        <a href="/student_portal?tab=subjects" class="header-btn" style="display:inline-block;background:#555;">← Back to Subjects & Teachers</a>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    res.send(renderTemplate(body, req));
});

// Student Portal
app.get('/student_portal', (req, res) => {
    if (!req.session.student_logged) return res.redirect('/login?type=student');
    let student = students_list.find(s => s.id === req.session.student_logged);
    if (!student) return res.redirect('/logout');

    let tab = req.query.tab || 'profile';
    let msg = req.query.msg || '';
    let body = '';

    if (tab === 'fees') {
        const myFees = studentFees(student.id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        const feeRows = myFees.length ? myFees.map((fee, i) => `
            <tr>
                <td style="text-align:center;">${i + 1}</td>
                <td>${fee.month}</td>
                <td>${feeNumber(fee.payable).toFixed(0)}</td>
                <td>${feeNumber(fee.paid).toFixed(0)}</td>
                <td>${feeNumber(fee.scholarship).toFixed(0)}</td>
                <td style="color:${feeDue(fee) > 0 ? '#d00' : '#16853a'};font-weight:bold;">Tk. ${feeDue(fee).toFixed(0)}</td>
                <td style="text-align:center;">—</td>
            </tr>`).join('') : `
            <tr><td colspan="7" style="text-align:center;padding:25px;color:#666;">No tuition fee record has been added yet.</td></tr>`;

        const totalPayable = myFees.reduce((s, f) => s + feeNumber(f.payable), 0);
        const totalPaid = myFees.reduce((s, f) => s + feeNumber(f.paid), 0);
        const totalScholarship = myFees.reduce((s, f) => s + feeNumber(f.scholarship), 0);
        const totalDue = myFees.reduce((s, f) => s + feeDue(f), 0);

        body = `
        <div class="main-container">
            <div class="student-dashboard-wrapper">
                <div class="sidebar-menu">
                    <a href="/student_portal" class="sidebar-item">🏠 Dashboard</a>
                    <a href="/student_portal?tab=profile" class="sidebar-item">👤 My Profile</a>
                    <a href="/student_portal?tab=subjects" class="sidebar-item">📚 My Subjects & Teachers</a>
                    <a href="/student_portal?tab=results" class="sidebar-item">📊 My Result & PDF Sheet</a>
                    <a href="/student_portal?tab=fees" class="sidebar-item" style="background:rgba(0,0,0,0.1);font-weight:bold;">💵 Tuition Fees</a>
                    <a href="/student_portal?tab=change_password" class="sidebar-item">🔐 Change Password</a>
                    ${getActiveExam() ? '<a href="/student_portal?tab=admit_card" class="sidebar-item">💳 Admit Card</a>' : ''}
                </div>
                <div class="profile-content-area">
                    <div style="padding:18px 12px 0;">
                        <h3 style="margin:0;border-bottom:2px solid ${portal_settings.accent_color};padding-bottom:7px;">💵 MY PAYMENTS</h3>
                        <div style="margin-top:8px;">
                            <span style="display:inline-block;background:#075b25;color:#fff;padding:8px 14px;font-weight:bold;">Monthly Payments</span>
                            <span style="display:inline-block;background:#0a3b1f;color:#fff;padding:8px 14px;font-weight:bold;">Payment History</span>
                        </div>
                        <h3 style="border-bottom:2px solid ${portal_settings.accent_color};padding:8px 0;">⚙ PAYMENTS (MONTH WISE):</h3>
                        <div style="overflow-x:auto;">
                            <table class="dash-table" style="margin-top:8px;">
                                <tr>
                                    <th>SI</th><th>Month Name [Payment]</th><th>Payable Amt.</th><th>Paid Amt.</th>
                                    <th>Scholarship</th><th>Due Amt.</th><th>Pay Online</th>
                                </tr>
                                ${feeRows}
                                <tr style="font-weight:bold;">
                                    <td></td><td style="text-align:right;">Total:</td>
                                    <td style="color:#00c;font-size:16px;">${totalPayable.toFixed(0)}</td>
                                    <td style="color:#16853a;font-size:16px;">${totalPaid.toFixed(0)}</td>
                                    <td style="font-size:16px;">${totalScholarship.toFixed(0)}</td>
                                    <td style="color:${totalDue > 0 ? '#d00' : '#16853a'};font-size:16px;">${totalDue.toFixed(0)}</td>
                                    <td></td>
                                </tr>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    } else if (tab === 'subjects') {
        let rows = getSubjectsForStudent(student).map(sub => {
            const subjectSheets = uploaded_sheets.filter(x => String(x.subject).trim().toLowerCase() === String(sub.name).trim().toLowerCase());
            const sheetButtons = subjectSheets.length ? `<a href="/student_portal/sheets?subject=${encodeURIComponent(sub.name)}" class="header-btn" style="display:inline-block;padding:7px 13px;margin:2px 0;background:#00796b;font-size:12px;">📄 View Sheet</a>` : '<span style="color:#999;font-size:12px;">No sheet</span>';
            return `
            <tr>
                <td style="text-align: center; font-weight: bold;">${sub.sl}</td>
                <td style="font-weight: bold; color: #111111;">${escapeHtml(sub.name)}</td>
                <td style="white-space: pre-line; font-size: 13px; color: #333333;">${escapeHtml(sub.teacher)}</td>
                <td style="text-align:center;">${sheetButtons}</td>
            </tr>`;
        }).join('');

        body = `
        <div class="main-container">
            <div class="student-dashboard-wrapper">
                <div class="sidebar-menu">
                    <a href="/student_portal?tab=profile" class="sidebar-item">🏠 Dashboard Profile</a>
                    <a href="/student_portal?tab=subjects" class="sidebar-item" style="background: rgba(0,0,0,0.1); font-weight: bold;">📚 My Subjects & Teachers</a>
                    <a href="/student_portal?tab=results" class="sidebar-item">📊 My Result & PDF Sheet</a>
                    <a href="/student_portal?tab=change_password" class="sidebar-item">🔐 Change Password</a>
                    <a href="#" class="sidebar-item">💵 Tuition Fees</a>
                    <a href="#" class="sidebar-item">🌐 Online Live Class</a>
                    <a href="#" class="sidebar-item">📝 Online Exam</a>
                    <a href="#" class="sidebar-item">💻 E-Learning</a>
                    <a href="#" class="sidebar-item">📋 Homeworks</a>
${getActiveExam() ? '<a href="/student_portal?tab=admit_card" class="sidebar-item">💳 Admit Card</a>' : ''}
                </div>
                <div class="profile-content-area">
                    <div class="student-id-banner">Subjects & Assigned Teachers (${portal_settings.school_name})</div>
                    <div style="padding: 20px;">
                        <table class="dash-table" style="color: #111111;">
                            <tr>
                                <th style="width: 60px; background-color: ${portal_settings.accent_color};">SI</th>
                                <th style="background-color: ${portal_settings.accent_color};">Subject Name</th>
                                <th style="background-color: ${portal_settings.accent_color};">Assigned Teacher & Contact</th>
                                <th style="background-color: ${portal_settings.accent_color}; text-align:center;">Subject Sheet</th>
                            </tr>
                            ${rows}
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
    } else if (tab === 'results') {
        const publishedExams = EXAMS.filter(exam => exam_state[exam.id].published);
        const activeExam = getActiveExam();
        let rows = publishedExams.map((exam, idx) => {
            const state = exam_state[exam.id];
            return `<tr>
                <td style="text-align:center; font-weight:bold;">${idx + 1}</td>
                <td style="font-weight:bold;">${exam.title}</td>
                <td style="text-align:center; color:#1b8f3b; font-weight:bold;">☑ Published On: ${formatExamDate(state.publishedAt)}</td>
                <td style="text-align:center;"><a href="/student_portal/download_result_pdf?exam=${encodeURIComponent(exam.id)}" target="_blank" style="color:#d60000; font-weight:bold; text-decoration:none;">▧<br>Download</a></td>
                <td style="text-align:center;"><a href="/student_portal?tab=result_view&exam=${encodeURIComponent(exam.id)}" style="color:#174ea6; font-weight:bold; text-decoration:none;">⌕<br>View</a></td>
            </tr>`;
        }).join('');

        if (!rows) {
            rows = `<tr><td colspan="5" style="text-align:center; padding:35px; color:#777;">No examination result has been published yet.</td></tr>`;
        }

        body = `
        <div class="main-container" style="max-width:1100px;">
            <div class="student-dashboard-wrapper">
                <div class="sidebar-menu">
                    <a href="/student_portal?tab=profile" class="sidebar-item">🏠 Dashboard Profile</a>
                    <a href="/student_portal?tab=subjects" class="sidebar-item">📚 My Subjects & Teachers</a>
                    <a href="/student_portal?tab=results" class="sidebar-item" style="background: rgba(0,0,0,0.1); font-weight:bold;">📊 Result & Progress Report</a>
${getActiveExam() ? '<a href="/student_portal?tab=admit_card" class="sidebar-item">💳 Admit Card</a>' : ''}
                    <a href="/student_portal?tab=change_password" class="sidebar-item">🔐 Change Password</a>
                </div>
                <div class="profile-content-area">
                    <div style="padding:18px 12px 0;">
                        <h3 style="margin:0; border-bottom:2px solid ${portal_settings.accent_color}; padding-bottom:7px;">📊 Result & Progress Report</h3>
                        <div style="overflow-x:auto;">
                        <table class="dash-table" style="margin-top:8px;">
                            <tr><th style="width:55px; text-align:center;">SI</th><th>Exam Title</th><th style="width:230px;">Status</th><th style="width:90px; text-align:center;">PDF</th><th style="width:120px; text-align:center;">View Result</th></tr>
                            ${rows}
                        </table>
                        </div>
                        ${activeExam ? `<div style="margin-top:15px; padding:10px; background:#e8f5e9; color:#1b5e20; font-weight:bold;">Current Examination: ${activeExam.title}</div>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
    } else if (tab === 'result_view') {
        const examId = req.query.exam;
        const exam = getExam(examId);
        if (!exam || !exam_state[exam.id].published) {
            return res.redirect('/student_portal?tab=results');
        }
        const studentExamMarks = (marks_db[exam.id] && marks_db[exam.id][student.room]) ? marks_db[exam.id][student.room] : {};
        let resultRows = '';
        let totalMarksSum = 0;
        let countSubs = 0;
        getSubjectsForStudent(student).forEach(sub => {
            const m = studentExamMarks[sub.name] && studentExamMarks[sub.name][student.roll] ? studentExamMarks[sub.name][student.roll] : null;
            if (m) { totalMarksSum += Number(m.total) || 0; }
            countSubs++;
            resultRows += `<tr><td style="font-weight:bold;">${sub.name}</td><td style="text-align:center;">${m ? m.written : '-'}</td><td style="text-align:center;">${m ? m.mcq : '-'}</td><td style="text-align:center;font-weight:bold;">${m ? m.total : '-'}</td><td style="text-align:center;font-weight:bold;">${m ? m.grade : '-'}</td></tr>`;
        });
        const avg = countSubs ? (totalMarksSum / countSubs).toFixed(2) : '0.00';
        body = `
        <div class="main-container">
            <div class="profile-content-area" style="max-width:920px;margin:0 auto;">
                <div style="padding:18px 12px 0;">
                    <h3 style="margin:0;border-bottom:2px solid ${portal_settings.accent_color};padding-bottom:7px;">📊 Result & Progress Report</h3>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;gap:10px;flex-wrap:wrap;">
                        <strong>${exam.title} - 2026</strong>
                        <a href="/student_portal?tab=results" class="header-btn">◀ Back</a>
                    </div>
                    <table class="dash-table"><tr><th>Subject Name</th><th style="text-align:center;">Written</th><th style="text-align:center;">MCQ</th><th style="text-align:center;">Total</th><th style="text-align:center;">Grade</th></tr>${resultRows}</table>
                    <p style="padding:10px;font-weight:bold;">Total: ${totalMarksSum} &nbsp; | &nbsp; Average: ${avg}</p>
                </div>
            </div>
        </div>`;
    } else if (tab === 'admit_card') {
        const activeExam = getActiveExam();
        const admitCardFeeDue = studentFees(student.id).reduce((sum, fee) => sum + feeDue(fee), 0);
        if (!activeExam) {
            body = `<div class="main-container"><div class="profile-content-area" style="max-width:900px;margin:0 auto;padding:35px;text-align:center;"><h3>ADMIT CARD</h3><p style="color:#b71c1c;font-weight:bold;">No examination is currently active. Please check again after the administration starts an exam.</p></div></div>`;
        } else if (admitCardFeeDue > 0) {
            body = `<div class="main-container"><div class="profile-content-area" style="max-width:900px;margin:0 auto;padding:35px;text-align:center;"><h3>ADMIT CARD</h3><p style="color:#b71c1c;font-weight:bold;font-size:18px;">Tuition Fee Due: Tk. ${admitCardFeeDue.toFixed(0)}</p><p>Please clear the due tuition fee to view your Admit Card.</p></div></div>`;
        } else {
            const photoHtml = student.photo ? `<img src="${student.photo}" alt="Student Photo" style="width:100%;height:100%;object-fit:cover;">` : '👤';
            body = `<div class="main-container" style="max-width:900px;">
                <div class="profile-content-area" style="padding:0;">
                    <div style="padding:10px 12px 0;"><h3 style="margin:0;border-bottom:2px solid ${portal_settings.accent_color};padding-bottom:7px;">ADMIT CARD</h3></div>
                    <div style="padding:0 18px 25px;">
                        <div style="text-align:center;margin:0 0 8px;"><a href="/student_portal/download_admit_card" target="_blank" class="header-btn" style="background:#2e8b37;">Print Admit Card</a></div>
                        <div class="admit-card-print" style="width:460px;max-width:100%;margin:0 auto;border:2px solid #111;padding:6px;background:#fff;color:#111;box-sizing:border-box;">
                            <div style="text-align:center;border-bottom:1px solid #999;padding-bottom:7px;">
                                <div style="font-weight:bold;font-size:18px;color:#16853a;">${portal_settings.school_name}</div>
                                <div style="font-size:11px;font-weight:bold;color:#d00;">${portal_settings.tagline}</div>
                            </div>
                            <div style="text-align:center;padding:10px 0 5px;"><div style="width:58px;height:72px;border:1px solid #777;margin:0 auto 8px;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:25px;">${photoHtml}</div><div style="font-size:16px;color:#0000aa;font-weight:bold;">ADMIT CARD</div><div style="font-size:14px;color:#0000aa;font-weight:bold;">${activeExam.title.toUpperCase()} - 2026</div></div>
                            <table style="width:100%;border-collapse:collapse;font-size:10px;"><tr><td style="border:1px solid #999;padding:4px;">Student's Name: <b>${student.name}</b></td><td style="border:1px solid #999;padding:4px;">Roll Number: <b>${student.roll}</b></td></tr><tr><td style="border:1px solid #999;padding:4px;">Student ID: <b>${student.student_no}</b></td><td style="border:1px solid #999;padding:4px;">Section: <b>${student.section || student.room}</b></td></tr><tr><td style="border:1px solid #999;padding:4px;">Class: <b>${student.class}</b></td><td style="border:1px solid #999;padding:4px;">Shift: <b>${student.shift || 'Day'}</b></td></tr></table>
                            <div style="display:flex;justify-content:space-between;padding:12px 12px 4px;font-size:9px;font-weight:bold;"><span>.<br>.</span><span>Principal<br>Dev's.Center</span></div>
                            <div style="background:#000;color:#fff;text-align:center;padding:5px;font-weight:bold;font-size:13px;">Dev's.Center</div>
                        </div>
                    </div>
                </div>
            </div>`;
        }
    } else if (tab === 'change_password') {
        body = `
        <div class="main-container">
            <div class="student-dashboard-wrapper">
                <div class="sidebar-menu">
                    <a href="/student_portal?tab=profile" class="sidebar-item">🏠 Dashboard Profile</a>
                    <a href="/student_portal?tab=subjects" class="sidebar-item">📚 My Subjects & Teachers</a>
                    <a href="/student_portal?tab=results" class="sidebar-item">📊 My Result & PDF Sheet</a>
                    <a href="/student_portal?tab=change_password" class="sidebar-item" style="background: rgba(0,0,0,0.1); font-weight: bold;">🔐 Change Password</a>
                    <a href="#" class="sidebar-item">💵 Tuition Fees</a>
                    <a href="#" class="sidebar-item">🌐 Online Live Class</a>
                    <a href="#" class="sidebar-item">📝 Online Exam</a>
                    <a href="#" class="sidebar-item">💻 E-Learning</a>
                    <a href="#" class="sidebar-item">📋 Homeworks</a>
${getActiveExam() ? '<a href="/student_portal?tab=admit_card" class="sidebar-item">💳 Admit Card</a>' : ''}
                </div>
                <div class="profile-content-area">
                    <div class="student-id-banner">Change Portal Password</div>
                    <div style="padding: 30px;">
                        ${msg ? `<div class="${msg.includes('success') ? '' : 'msg'}" style="${msg.includes('success') ? 'background:#d4edda; color:#155724; padding:10px; border-radius:4px; margin-bottom:15px;' : ''}">${msg}</div>` : ''}
                        <form method="POST" action="/student_portal/change_password" style="max-width: 400px;">
                            <label style="display:block; margin-bottom:6px; font-weight:bold; font-size:13px;">Current Password:</label>
                            <input type="password" name="old_password" class="dash-input" placeholder="Enter current password" required>
                            
                            <label style="display:block; margin-bottom:6px; font-weight:bold; font-size:13px;">New Password:</label>
                            <input type="password" name="new_password" class="dash-input" placeholder="Enter new password" required>
                            
                            <label style="display:block; margin-bottom:6px; font-weight:bold; font-size:13px;">Confirm New Password:</label>
                            <input type="password" name="confirm_password" class="dash-input" placeholder="Confirm new password" required>

                            <button type="submit" class="header-btn" style="cursor:pointer; border:none; margin-top:10px; padding: 10px 20px;">Update Password</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>`;
    } else {
        let photoHtml = student.photo ? `<img src="${student.photo}" alt="Student Photo">` : '👤';
        body = `
        <div class="main-container">
            <div class="student-dashboard-wrapper">
                <div class="sidebar-menu">
                    <a href="/student_portal?tab=profile" class="sidebar-item" style="background: rgba(0,0,0,0.1); font-weight: bold;">🏠 Dashboard Profile</a>
                    <a href="/student_portal?tab=subjects" class="sidebar-item">📚 My Subjects & Teachers</a>
                    <a href="/student_portal?tab=results" class="sidebar-item">📊 My Result & PDF Sheet</a>
                    <a href="/student_portal?tab=change_password" class="sidebar-item">🔐 Change Password</a>
                    <a href="#" class="sidebar-item">💵 Tuition Fees</a>
                    <a href="#" class="sidebar-item">🌐 Online Live Class</a>
                    <a href="#" class="sidebar-item">📝 Online Exam</a>
                    <a href="#" class="sidebar-item">💻 E-Learning</a>
                    <a href="#" class="sidebar-item">📋 Homeworks</a>
${getActiveExam() ? '<a href="/student_portal?tab=admit_card" class="sidebar-item">💳 Admit Card</a>' : ''}
                </div>
                <div class="profile-content-area">
                    <div class="student-id-banner">Student ID # ${student.student_no}</div>
                    <div class="class-section-row">
                        <div class="class-col">Class: ${student.class}</div>
                        <div class="section-col">Room: ${student.room}</div>
                    </div>
                    <div class="student-photo-container">
                        <div class="student-avatar">${photoHtml}</div>
                    </div>
                    <div class="student-name-banner">${student.name}</div>
                    <div class="feature-grid">
                        <a href="/student_portal?tab=profile" class="feature-box">
                            <div class="feature-icon" style="background: #e67e22;">👤</div>
                            <div class="feature-title">My Profile</div>
                        </a>
                        <a href="/student_portal?tab=fees" class="feature-box">
                            <div class="feature-icon" style="background: #2e8b57;">💵</div>
                            <div class="feature-title">Tuition Fees</div>
                        </a>
                        <a href="/student_portal?tab=results" class="feature-box">
                            <div class="feature-icon" style="background: #27ae60;">📊</div>
                            <div class="feature-title">My Result</div>
                        </a>${getActiveExam() ? `<a href="/student_portal?tab=admit_card" class="feature-box">
                            <div class="feature-icon" style="background: #2e8b57;">💳</div>
                            <div class="feature-title">Admit Card</div>
                        </a>` : ''}
                        <a href="/student_portal?tab=change_password" class="feature-box">
                            <div class="feature-icon" style="background: #c0392b;">🔐</div>
                            <div class="feature-title">Change Password</div>
                        </a>
                        <a href="/student_portal?tab=subjects" class="feature-box">
                            <div class="feature-icon" style="background: #2980b9;">📚</div>
                            <div class="feature-title">My Subjects & Teachers</div>
                        </a>
                        <a href="#" class="feature-box">
                            <div class="feature-icon" style="background: #16a085;">🌐</div>
                            <div class="feature-title">Online Live Class</div>
                        </a>
                        <a href="#" class="feature-box">
                            <div class="feature-icon" style="background: #8e44ad;">📝</div>
                            <div class="feature-title">Online Exam</div>
                        </a>
                        <a href="#" class="feature-box">
                            <div class="feature-icon" style="background: #d35400;">💻</div>
                            <div class="feature-title">E-Learning</div>
                        </a>
                        <a href="#" class="feature-box">
                            <div class="feature-icon" style="background: #27ae60;">📋</div>
                            <div class="feature-title">Homeworks</div>
                        </a>
                    </div>
                </div>
            </div>
        </div>`;
    }
    savePortalData();
    res.send(renderTemplate(body, req));
});

// Printable result sheet for a published exam
app.get('/student_portal/download_result_pdf', (req, res) => {
    if (!req.session.student_logged) return res.redirect('/login?type=student');
    let student = students_list.find(s => s.id === req.session.student_logged);
    if (!student) return res.redirect('/logout');
    const exam = getExam(req.query.exam);
    if (!exam || !exam_state[exam.id].published) return res.redirect('/student_portal?tab=results');

    let studentRoomMarks = (marks_db[exam.id] && marks_db[exam.id][student.room]) ? marks_db[exam.id][student.room] : {};
    let tableRows = '';
    let totalMarksSum = 0;
    let countSubs = 0;
    getSubjectsForStudent(student).forEach(sub => {
        let m = (studentRoomMarks[sub.name] && studentRoomMarks[sub.name][student.roll]) ? studentRoomMarks[sub.name][student.roll] : { written: 0, mcq: 0, total: 0, grade: '-' };
        totalMarksSum += Number(m.total) || 0; countSubs++;
        tableRows += `<tr><td>${sub.name}</td><td style="text-align:center;">${m.written}</td><td style="text-align:center;">${m.mcq}</td><td style="text-align:center;font-weight:bold;">${m.total}</td><td style="text-align:center;font-weight:bold;">${m.grade}</td></tr>`;
    });
    const avg = countSubs ? (totalMarksSum / countSubs).toFixed(2) : '0.00';
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${exam.title} - Result - ${student.name}</title><style>body{font-family:Arial,sans-serif;padding:35px;color:#111}.header{text-align:center;border-bottom:2px solid #333;padding-bottom:12px}.info{margin:18px 0;font-size:14px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:8px}th{background:#333;color:#fff}.footer{display:flex;justify-content:space-between;margin-top:70px;font-weight:bold}@media print{.no-print{display:none}}</style></head><body onload="window.print()"><div class="header"><h2 style="margin:0">${portal_settings.school_name}</h2><p style="margin:5px 0;color:#555">${portal_settings.tagline}</p><h3>${exam.title.toUpperCase()} - 2026</h3><strong>RESULT & PROGRESS REPORT</strong></div><div class="info"><b>Student Name:</b> ${student.name}<br><b>Roll Number:</b> ${student.roll} &nbsp; | &nbsp; <b>Student ID:</b> ${student.student_no}<br><b>Class:</b> ${student.class} &nbsp; | &nbsp; <b>Room:</b> ${student.room}</div><table><tr><th>Subject Name</th><th>Written</th><th>MCQ</th><th>Total</th><th>Grade</th></tr>${tableRows}</table><p><b>Total Aggregate Score:</b> ${totalMarksSum} &nbsp; | &nbsp; <b>Average:</b> ${avg}</p><div class="footer"><div>.<br>.</div><div>Dev's.Center<br>Principal</div></div><p style="text-align:center;margin-top:35px;font-weight:bold;">Dev's.Center</p></body></html>`);
});

// Printable admit card for the currently active exam
app.get('/student_portal/download_admit_card', (req, res) => {
    if (!req.session.student_logged) return res.redirect('/login?type=student');
    let student = students_list.find(s => s.id === req.session.student_logged);
    const exam = getActiveExam();
    if (!student) return res.redirect('/logout');
    if (!exam) return res.redirect('/student_portal?tab=admit_card');
    const printAdmitCardFeeDue = studentFees(student.id).reduce((sum, fee) => sum + feeDue(fee), 0);
    if (printAdmitCardFeeDue > 0) return res.redirect('/student_portal?tab=admit_card');
    const photoHtml = student.photo ? `<img src="${student.photo}" style="width:100%;height:100%;object-fit:cover;">` : '👤';
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Admit Card - ${student.name}</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#111}.card{width:470px;max-width:100%;margin:0 auto;border:2px solid #111;padding:7px;box-sizing:border-box}.photo{width:58px;height:72px;border:1px solid #777;margin:0 auto 8px;overflow:hidden;display:flex;align-items:center;justify-content:center}.info{width:100%;border-collapse:collapse;font-size:11px}.info td{border:1px solid #999;padding:5px}.sign{display:flex;justify-content:space-between;margin-top:20px;font-size:10px;font-weight:bold}.brand{background:#000;color:#fff;text-align:center;padding:6px;font-weight:bold}@media print{.no-print{display:none}}</style></head><body onload="window.print()"><div class="no-print" style="text-align:center;margin-bottom:10px"><button onclick="window.print()">Print / Save PDF</button></div><div class="card"><div style="text-align:center;border-bottom:1px solid #999;padding-bottom:7px"><div style="font-weight:bold;font-size:18px;color:#16853a">${portal_settings.school_name}</div><div style="font-size:11px;color:#d00;font-weight:bold">${portal_settings.tagline}</div></div><div style="text-align:center;padding:10px 0 5px"><div class="photo">${photoHtml}</div><div style="font-size:16px;color:#0000aa;font-weight:bold">ADMIT CARD</div><div style="font-size:14px;color:#0000aa;font-weight:bold">${exam.title.toUpperCase()} - 2026</div></div><table class="info"><tr><td>Student's Name: <b>${student.name}</b></td><td>Roll Number: <b>${student.roll}</b></td></tr><tr><td>Student ID: <b>${student.student_no}</b></td><td>Section: <b>${student.section || student.room}</b></td></tr><tr><td>Class: <b>${student.class}</b></td><td>Shift: <b>${student.shift || 'Day'}</b></td></tr></table><div class="sign"><span>.<br>.</span><span>Principal<br>Dev's.Center</span></div><div class="brand">Dev's.Center</div></div></body></html>`);
});

app.post('/student_portal/change_password', (req, res) => {
    if (!req.session.student_logged) return res.redirect('/login?type=student');
    let student = students_list.find(s => s.id === req.session.student_logged);
    if (!student) return res.redirect('/logout');

    let { old_password, new_password, confirm_password } = req.body;
    let msg = '';

    if (student.pass !== old_password) {
        msg = 'Incorrect current password!';
    } else if (new_password !== confirm_password) {
        msg = 'New password and confirm password do not match!';
    } else if (!new_password || new_password.length < 3) {
        msg = 'New password must be at least 3 characters long!';
    } else {
        student.pass = new_password;
        msg = 'Password changed successfully!';
    }

    savePortalData();
    res.redirect(`/student_portal?tab=change_password&msg=${encodeURIComponent(msg)}`);
});

// Admin Dashboard
app.get('/dashboard', (req, res) => {
    if (!req.session.admin_logged) return res.redirect('/login?type=admin');
    let successMsg = req.query.msg || '';
    let aiResponse = req.query.ai_response || '';

    let presetOptions = Object.keys(PRESET_THEMES).map(key => `<option value="${key}">${PRESET_THEMES[key].name}</option>`).join('');
    let studentSelectOptions = students_list.length > 0 
        ? students_list.map(s => `<option value="${s.roll}">Roll: ${s.roll} - ${s.name} (Class: ${s.class})</option>`).join('')
        : '<option value="">-- No Students Available --</option>';

    let teacherSubjectOptions = subjects_list.slice().sort((a,b) => String(a.name||'').localeCompare(String(b.name||''), undefined, { sensitivity:'base' })).map(sub => `<option value="${escapeHtml(sub.name)}">${escapeHtml(sub.name)}</option>`).join('');
    let teachersRows = teachers_list.length > 0 ? teachers_list.map(t => {
        const ts = getTeacherSubjects(t);
        const s1 = ts[0] || '', s2 = ts[1] || '', s3 = ts[2] || '';
        return `<tr>
            <td style="text-align:center;"><input type="checkbox" name="selected_teachers" value="${escapeHtml(t.id)}"></td>
            <td colspan="6">
                <form method="POST" style="margin:0;">
                    <input type="hidden" name="action" value="update_teacher">
                    <input type="hidden" name="original_teacher_id" value="${escapeHtml(t.id)}">
                    <div style="display:grid;grid-template-columns:1fr 1fr 1.3fr 1fr 1fr 1fr 1fr auto auto;gap:8px;align-items:end;">
                        <div><label style="font-size:11px;font-weight:bold;">Teacher ID</label><input type="text" name="teacher_id" class="dash-input" value="${escapeHtml(t.id)}" required style="margin:0;"></div>
                        <div><label style="font-size:11px;font-weight:bold;">Password</label><input type="text" name="teacher_pass" class="dash-input" value="${escapeHtml(t.pass)}" required style="margin:0;"></div>
                        <div><label style="font-size:11px;font-weight:bold;">Full Name</label><input type="text" name="teacher_name" class="dash-input" value="${escapeHtml(t.name)}" required style="margin:0;"></div>
                        <div><label style="font-size:11px;font-weight:bold;">Phone</label><input type="text" name="teacher_phone" class="dash-input" value="${escapeHtml(t.phone)}" required style="margin:0;"></div>
                        <div><label style="font-size:11px;font-weight:bold;">Subject 1</label><select name="teacher_subject1" class="dash-input" style="margin:0;"><option value="">-- No Subject --</option>${teacherSubjectOptions.replace(`value="${escapeHtml(s1)}"`, `value="${escapeHtml(s1)}" selected`)}</select></div>
                        <div><label style="font-size:11px;font-weight:bold;">Subject 2</label><select name="teacher_subject2" class="dash-input" style="margin:0;"><option value="">-- No Subject --</option>${teacherSubjectOptions.replace(`value="${escapeHtml(s2)}"`, `value="${escapeHtml(s2)}" selected`)}</select></div>
                        <div><label style="font-size:11px;font-weight:bold;">Subject 3</label><select name="teacher_subject3" class="dash-input" style="margin:0;"><option value="">-- No Subject --</option>${teacherSubjectOptions.replace(`value="${escapeHtml(s3)}"`, `value="${escapeHtml(s3)}" selected`)}</select></div>
                        <button type="submit" class="header-btn" style="border:0;cursor:pointer;background:#00796b;">💾 Save</button>
                        <button type="submit" formmethod="POST" name="action" value="delete_teacher" class="del-btn" onclick="return confirm('Delete this teacher login account?')">Delete</button>
                    </div>
                </form>
            </td>
        </tr>`;
    }).join('') : `<tr><td colspan="7" style="text-align:center;color:#555;">No teacher accounts found. Create one below.</td></tr>`;


    let noticeRows = notice_board.map(n => `
        <tr>
            <td style="text-align: center; font-weight: bold;">${n.id}</td>
            <td>
                <form method="POST" style="margin:0; display:flex; gap:10px;">
                    <input type="hidden" name="action" value="update_notice">
                    <input type="hidden" name="notice_id" value="${n.id}">
                    <input type="text" name="notice_text" value="${n.text}" class="dash-input" style="margin-bottom:0; flex-grow:1;" required>
                    <button type="submit" class="header-btn" style="cursor:pointer; border:none; padding:6px 12px; background-color:#2e7d32;">Save</button>
                </form>
            </td>
            <td style="text-align: center;">
                <form method="POST" style="margin:0;">
                    <input type="hidden" name="action" value="delete_notice">
                    <input type="hidden" name="notice_id" value="${n.id}">
                    <button type="submit" class="del-btn" onclick="return confirm('이 নোটিশটি মুছে ফেলতে চান?')">Delete</button>
                </form>
            </td>
        </tr>`).join('');

    let studentsRows = students_list.length > 0 ? students_list.map(s => `
        <tr>
            <td style="text-align: center;"><input type="checkbox" name="selected_students" value="${s.roll}"></td>
            <td>${s.id}</td>
            <td>${s.pass}</td>
            <td>${s.roll}</td>
            <td>${s.name}</td>
            <td>${s.class}</td>
            <td>${s.room}</td>
            <td>${s.student_no}</td>
            <td>
                <form method="POST" style="margin:0;">
                    <input type="hidden" name="action" value="delete_student">
                    <input type="hidden" name="target_roll" value="${s.roll}">
                    <button type="submit" class="del-btn" onclick="return confirm('Are you sure you want to delete this student?')">Delete</button>
                </form>
            </td>
        </tr>`).join('') : `<tr><td colspan="9" style="text-align:center; color:#555;">No students found. Add a new student below.</td></tr>`;

    let roomOptions = '';
    for(let i=1; i<=10; i++) roomOptions += `<option value="Room ${i}">Room ${i}</option>`;

    // Class 1 to Class 10 options generator
    let classOptions = '';
    for(let i=1; i<=10; i++) {
        classOptions += `<option value="Class ${i}">Class ${i}</option>`;
    }

    let examControlRows = EXAMS.map((exam, idx) => {
        const st = exam_state[exam.id];
        const isActive = active_exam_id === exam.id && st.active;
        return `<tr>
            <td style="text-align:center;font-weight:bold;">${idx + 1}</td>
            <td style="font-weight:bold;">${exam.title}</td>
            <td style="text-align:center;">${isActive ? '<span style="color:#16853a;font-weight:bold;">🟢 ACTIVE</span>' : '<span style="color:#777;">Stopped</span>'}</td>
            <td style="text-align:center;">${st.published ? '<span style="color:#16853a;font-weight:bold;">Published</span>' : '<span style="color:#b71c1c;">Not Published</span>'}</td>
            <td style="text-align:center;white-space:nowrap;">${isActive ? `<form method="POST" style="display:inline"><input type="hidden" name="action" value="stop_exam"><input type="hidden" name="exam_id" value="${exam.id}"><button class="del-btn" type="submit">■ Stop Exam</button></form>` : `<form method="POST" style="display:inline"><input type="hidden" name="action" value="start_exam"><input type="hidden" name="exam_id" value="${exam.id}"><button class="header-btn" type="submit" style="border:none;cursor:pointer;background:#2e8b57;">▶ Start Exam</button></form>`}</td>
            <td style="text-align:center;white-space:nowrap;">${st.published ? `<form method="POST" style="display:inline"><input type="hidden" name="action" value="unpublish_exam"><input type="hidden" name="exam_id" value="${exam.id}"><button class="del-btn" type="submit">Unpublish</button></form>` : `<form method="POST" style="display:inline"><input type="hidden" name="action" value="publish_exam"><input type="hidden" name="exam_id" value="${exam.id}"><button class="header-btn" type="submit" style="border:none;cursor:pointer;">Publish Result</button></form>`}</td>
        </tr>`;
    }).join('');

    let body = `
    <div class="main-container" style="display: block;">
        <div class="card" style="margin-bottom: 20px;">
            <h3>⚙️ Admin Control Panel & Management Tools</h3>
            ${successMsg ? `<div style="background:#1b5e20; color:#fff; padding:10px; border-radius:4px; margin-bottom:15px;">${successMsg}</div>` : ''}
            
            <div style="background:rgba(0,0,0,0.03);border:1px solid #ddd;padding:18px;border-radius:6px;margin-bottom:25px;">
                <h4 style="margin:0 0 8px;color:#111;">🎓 Examination Control</h4>
                <p style="margin:0 0 12px;font-size:13px;color:#555;">Start/stop one of the four examinations. The active examination automatically controls the student Admit Card and the teacher Marks Upload panel.</p>
                <div style="overflow-x:auto;"><table class="dash-table"><tr><th>SI</th><th>Exam Name</th><th>Exam Status</th><th>Result</th><th>Start / Stop</th><th>Publish</th></tr>${examControlRows}</table></div>
                <div style="margin-top:10px;padding:10px;background:#e8f5e9;color:#1b5e20;font-weight:bold;">${getActiveExam() ? `Current Active Exam: ${getActiveExam().title}` : 'No Exam Active'}</div>
            </div>

            <div class="dashboard-grid">
                <div>
                    <h4 style="color:#111111;">1. Change Name, Tagline & Logo</h4>
                    <form method="POST">
                        <input type="hidden" name="action" value="update_settings">
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Portal/Brand Name:</label>
                        <input type="text" name="school_name" class="dash-input" value="${portal_settings.school_name}" required>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Subtitle / Tagline:</label>
                        <input type="text" name="tagline" class="dash-input" value="${portal_settings.tagline}" required>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Logo Type:</label>
                        <select name="logo_type" class="dash-input">
                            <option value="text" ${portal_settings.logo_type === 'text' ? 'selected' : ''}>Text Logo</option>
                            <option value="image" ${portal_settings.logo_type === 'image' ? 'selected' : ''}>Image URL Logo</option>
                        </select>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Logo Text:</label>
                        <input type="text" name="logo_text" class="dash-input" value="${portal_settings.logo_text}">
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Logo Image URL:</label>
                        <input type="text" name="logo_url" class="dash-input" value="${portal_settings.logo_url}" placeholder="https://example.com/logo.png">
                        <button type="submit" class="header-btn" style="cursor:pointer; border:none;">Update Logo & Name</button>
                    </form>
                </div>
                <div>
                    <h4 style="color:#111111;">2. Home Page Content Editor</h4>
                    <form method="POST" style="margin-bottom:20px;">
                        <input type="hidden" name="action" value="update_home_content">
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Home Page Title:</label>
                        <input type="text" name="home_title" class="dash-input" value="${portal_settings.home_title}" required>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Home Page Description:</label>
                        <textarea name="home_description" class="dash-input" rows="3" required style="resize:vertical;">${portal_settings.home_description}</textarea>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Feature Section Title:</label>
                        <input type="text" name="home_feature_title" class="dash-input" value="${portal_settings.home_feature_title}" required>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Feature 1:</label>
                        <input type="text" name="home_feature_1" class="dash-input" value="${portal_settings.home_feature_1}" required>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Feature 2:</label>
                        <input type="text" name="home_feature_2" class="dash-input" value="${portal_settings.home_feature_2}" required>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Feature 3:</label>
                        <input type="text" name="home_feature_3" class="dash-input" value="${portal_settings.home_feature_3}" required>
                        <button type="submit" class="header-btn" style="cursor:pointer;border:none;background:#00796b;">Save Home Page Content</button>
                    </form>

                    <h4 style="color:#111111;">3. One-Click Preset Themes & Custom Colors</h4>
                    <form method="POST" style="margin-bottom: 20px; background: rgba(0,0,0,0.03); padding: 15px; border-radius: 6px; border: 1px dashed ${portal_settings.accent_color};">
                        <input type="hidden" name="action" value="apply_preset_theme">
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111; font-weight:bold;">⚡ One-Click Preset Themes:</label>
                        <div style="display: flex; gap: 10px;">
                            <select name="preset_theme" class="dash-input" style="margin-bottom:0; flex-grow:1;" required>${presetOptions}</select>
                            <button type="submit" class="header-btn" style="cursor:pointer; border:none; background-color: #0088cc; white-space:nowrap;">Apply Theme</button>
                        </div>
                    </form>
                    <form method="POST">
                        <input type="hidden" name="action" value="update_theme">
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Body Background Color:</label>
                        <input type="text" name="bg_color" class="dash-input" value="${portal_settings.bg_color}">
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Header Background Color:</label>
                        <input type="text" name="header_color" class="dash-input" value="${portal_settings.header_color}">
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Accent/Border Color:</label>
                        <input type="text" name="accent_color" class="dash-input" value="${portal_settings.accent_color}">
                        <button type="submit" class="header-btn" style="cursor:pointer; border:none;">Save Custom Colors</button>
                    </form>
                </div>
            </div>

            <hr style="border-color: #dddddd; margin: 25px 0;">

            <div style="background: rgba(0,0,0,0.02); border: 1px dashed ${portal_settings.accent_color}; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                <h4 style="color: #111111; margin-top: 0;">📢 হোম পেজ নোটিশ বোর্ড ম্যানেজমেন্ট (Notice Board Editor)</h4>
                <form method="POST" style="margin-bottom: 20px;">
                    <input type="hidden" name="action" value="add_notice">
                    <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">নতুন নোটিশ যোগ করুন (বাংলায়):</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" name="notice_text" class="dash-input" placeholder="নোটিশের বিবরণ লিখুন..." required style="margin-bottom:0; flex-grow:1;">
                        <button type="submit" class="header-btn" style="cursor:pointer; border:none; background-color: #00796b; white-space:nowrap;">নোটিশ প্রকাশ করুন</button>
                    </div>
                </form>
                <h5 style="color: #111111; margin: 0 0 8px 0;">বর্তমান নোটিশসমূহ এডিট বা ডিলিট করুন:</h5>
                <table class="dash-table">
                    <tr>
                        <th style="width: 50px; text-align: center;">ID</th>
                        <th>নোটিশের বিবরণ (বাংলা)</th>
                        <th style="width: 100px; text-align: center;">Action</th>
                    </tr>
                    ${noticeRows}
                </table>
            </div>

            <hr style="border-color: #dddddd; margin: 25px 0;">

            <div style="background: rgba(0,0,0,0.02); border: 1px dashed ${portal_settings.accent_color}; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                <h4 style="color: #111111; margin-top: 0;">🤖 বাংলা এআই সহকারী (Bangla AI Assistant) কন্ট্রোল টুল</h4>
                <form method="POST" style="margin-bottom: 15px;">
                    <input type="hidden" name="action" value="update_ai_prompt">
                    <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">এআই সিস্টেম নির্দেশনা (AI Bangla Prompt):</label>
                    <textarea name="ai_prompt" class="dash-input" rows="3" required style="resize: vertical;">${portal_settings.ai_prompt}</textarea>
                    <button type="submit" class="header-btn" style="cursor:pointer; border:none;">প্রম্পট সেভ করুন</button>
                </form>
                <form method="POST">
                    <input type="hidden" name="action" value="ask_ai">
                    <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">এআই-এর সাথে বাংলায় কথা বলে টেস্ট করুন:</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" name="ai_query" class="dash-input" placeholder="যেমন: কেমন আছো?..." required style="margin-bottom:0; flex-grow:1;">
                        <button type="submit" class="header-btn" style="cursor:pointer; border:none; background-color: #0088cc;">বাংলায় কথা বলুন</button>
                    </div>
                </form>
                ${aiResponse ? `<div style="margin-top: 15px; background: #f4f6f9; border: 1px solid ${portal_settings.accent_color}; padding: 15px; border-radius: 4px; color: #111111; white-space: pre-wrap; font-size: 14px;"><strong>এআই আউটপুট:</strong><br>${aiResponse}</div>` : ''}
            </div>

            <hr style="border-color: #dddddd; margin: 25px 0;">

            <div style="background: rgba(0,0,0,0.02); border: 1px solid #dddddd; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                <h4 style="color: #111111; margin-top: 0;">👨‍🏫 Teacher Account Create & Login Access</h4>
                <form method="POST" style="margin-bottom: 20px;">
                    <input type="hidden" name="action" value="add_teacher">
                    <div class="dashboard-grid" style="margin-bottom: 0;">
                        <div>
                            <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Teacher Login ID:</label>
                            <input type="text" name="teacher_id" class="dash-input" placeholder="e.g. masuda" required>
                            <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Teacher Password:</label>
                            <input type="text" name="teacher_pass" class="dash-input" placeholder="e.g. 1234" required>
                        </div>
                        <div>
                            <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Teacher Full Name:</label>
                            <input type="text" name="teacher_name" class="dash-input" placeholder="e.g. MASUDA KHATUN" required>
                            <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Phone Number:</label>
                            <input type="text" name="teacher_phone" class="dash-input" placeholder="01805992372" required>
                            <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Subject 1:</label>
                            <select name="teacher_subject1" class="dash-input teacher-subject-select" style="margin-bottom:8px;">
                                <option value="">-- No Subject --</option>
                                ${subjects_list.map(sub => `<option value="${sub.name}">${sub.name}</option>`).join('')}
                            </select>
                            <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Subject 2: <span style="font-weight:normal;color:#666;">(Optional)</span></label>
                            <select name="teacher_subject2" class="dash-input teacher-subject-select" style="margin-bottom:8px;">
                                <option value="">-- No Subject --</option>
                                ${subjects_list.map(sub => `<option value="${sub.name}">${sub.name}</option>`).join('')}
                            </select>
                            <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Subject 3: <span style="font-weight:normal;color:#666;">(Optional)</span></label>
                            <select name="teacher_subject3" class="dash-input teacher-subject-select" style="margin-bottom:0;">
                                <option value="">-- No Subject --</option>
                                ${subjects_list.map(sub => `<option value="${sub.name}">${sub.name}</option>`).join('')}
                            </select>
                            <small style="display:block;margin-top:5px;color:#666;">Optional — no subject is also allowed. The same subject cannot be selected more than once.</small>
                            <script>
                            document.currentScript.parentElement.querySelectorAll('.teacher-subject-select').forEach(function(select){
                                select.addEventListener('change', function(){
                                    const selects=[...document.currentScript.parentElement.querySelectorAll('.teacher-subject-select')];
                                    const values=selects.map(s=>s.value).filter(Boolean);
                                    if(new Set(values).size !== values.length){
                                        alert('The same subject cannot be selected more than once.');
                                        this.value='';
                                    }
                                });
                            });
                            </script>
                        </div>
                    </div>
                    <button type="submit" class="header-btn" style="cursor:pointer; border:none; margin-top:15px; background-color: #00796b;">Create Teacher Account</button>
                </form>

                <form method="POST">
                    <input type="hidden" name="action" value="delete_selected_teachers">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h5 style="color: #111111; margin: 0;">Existing Teacher Accounts List:</h5>
                        <button type="submit" class="del-btn" onclick="return confirm('Delete selected teachers?')">🗑 Delete Selected</button>
                    </div>
                    <table class="dash-table">
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" id="select_all_teachers" onclick="toggleAllCheckboxes(this, 'selected_teachers')"></th>
                            <th>Teacher ID</th><th>Password</th><th>Full Name</th><th>Phone Number</th><th>Subject</th><th>Action</th>
                        </tr>
                        ${teachersRows}
                    </table>
                </form>
            </div>

            <hr style="border-color: #dddddd; margin: 25px 0;">

            <div class="dashboard-grid">
                <div>
                    <h4 style="color:#111111;">3. Add New Student</h4>
                    <form method="POST">
                        <input type="hidden" name="action" value="add_student">
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Login User ID:</label>
                        <input type="text" name="student_id" class="dash-input" placeholder="e.g. jihan365" required>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Password:</label>
                        <input type="text" name="student_pass" class="dash-input" placeholder="e.g. 1234" required>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Roll Number:</label>
                        <input type="text" name="roll" class="dash-input" placeholder="e.g. 365" required>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Name:</label>
                        <input type="text" name="name" class="dash-input" placeholder="e.g. JUBEYER" required>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Class:</label>
                        <select name="class" class="dash-input" required>${classOptions}</select>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Room Number:</label>
                        <select name="room" class="dash-input" required>${roomOptions}</select>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Shift:</label>
                        <select name="shift" class="dash-input" required>
                            <option value="Day">Day</option>
                            <option value="Morning">Morning</option>
                        </select>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Religion:</label>
                        <select name="religion" class="dash-input" required>
                            <option value="Islam">Islam and Moral Education</option>
                            <option value="Hindu">Hindu and Moral Education</option>
                        </select>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Student ID No:</label>
                        <input type="text" name="student_no" class="dash-input" placeholder="2620600196" required>
                        <button type="submit" class="header-btn" style="cursor:pointer; border:none; margin-top:10px;">Add Student</button>
                    </form>
                </div>
                <div>
                    <h4 style="color:#111111;">4. Update Student Details</h4>
                    <form method="POST">
                        <input type="hidden" name="action" value="update_student_full">
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">Select Student (Roll):</label>
                        <select name="target_roll" class="dash-input" required>
                            ${studentSelectOptions}
                        </select>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">New Student Name:</label>
                        <input type="text" name="new_name" class="dash-input" placeholder="New name" required>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">New Roll Number:</label>
                        <input type="text" name="new_roll" class="dash-input" placeholder="New roll" required>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">New User ID:</label>
                        <input type="text" name="new_id" class="dash-input" placeholder="New ID" required>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">New Password:</label>
                        <input type="text" name="new_pass" class="dash-input" placeholder="New pass" required>
                        <label style="display:block; margin-bottom:6px; font-size:12px; color:#111111;">New Room:</label>
                        <select name="new_room" class="dash-input" required>${roomOptions}</select>
                        <button type="submit" class="header-btn" style="cursor:pointer; border:none; margin-top: 10px;">Update Student Info</button>
                    </form>
                </div>
            </div>
        </div>


        <div class="card" style="margin-bottom:20px;">
            <h4 style="color:#111;margin-top:0;">💵 Tuition Fee Management</h4>
            <p style="font-size:13px;color:#555;">Search a student by User ID / Student ID / name, add a monthly fee, or apply the same fee to every registered student.</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                <div style="background:rgba(0,0,0,0.02);border:1px dashed #aaa;padding:15px;border-radius:6px;">
                    <h5 style="margin-top:0;">1. Add Fee to One Student</h5>
                    <input id="fee_student_search" type="text" class="dash-input" placeholder="Search User ID / Student ID / Name" oninput="filterFeeStudents(this.value)">
                    <form method="POST">
                        <input type="hidden" name="action" value="add_student_fee">
                        <label style="display:block;font-size:12px;font-weight:bold;">Select Student:</label>
                        <select id="fee_student_select" name="student_id" class="dash-input" required>
                            ${students_list.map(s => `<option value="${s.id}">${s.id} — ${s.student_no} — ${s.name}</option>`).join('')}
                        </select>
                        <label style="display:block;font-size:12px;font-weight:bold;">Month:</label>
                        <input type="text" name="month" class="dash-input" placeholder="January, 2026" required>
                        <label style="display:block;font-size:12px;font-weight:bold;">Payable Amount:</label>
                        <input type="number" name="payable" class="dash-input" min="0" step="1" required>
                        <label style="display:block;font-size:12px;font-weight:bold;">Paid Amount:</label>
                        <input type="number" name="paid" class="dash-input" min="0" step="1" value="0">
                        <label style="display:block;font-size:12px;font-weight:bold;">Scholarship:</label>
                        <input type="number" name="scholarship" class="dash-input" min="0" step="1" value="0">
                        <button type="submit" class="header-btn" style="border:none;cursor:pointer;">Add Fee</button>
                    </form>
                </div>
                <div style="background:rgba(0,0,0,0.02);border:1px dashed #aaa;padding:15px;border-radius:6px;">
                    <h5 style="margin-top:0;">2. Add One Fee to All Students</h5>
                    <form method="POST">
                        <input type="hidden" name="action" value="add_fee_all">
                        <label style="display:block;font-size:12px;font-weight:bold;">Class:</label>
                        <select name="fee_class" class="dash-input">
                            <option value="">All Classes</option>
                            ${classOptions}
                        </select>
                        <label style="display:block;font-size:12px;font-weight:bold;">Room:</label>
                        <select name="fee_room" class="dash-input">
                            <option value="">All Rooms</option>
                            ${roomOptions}
                        </select>
                        <label style="display:block;font-size:12px;font-weight:bold;">Shift:</label>
                        <select name="fee_shift" class="dash-input">
                            <option value="">All Shifts</option>
                            <option value="Day">Day</option>
                            <option value="Morning">Morning</option>
                        </select>
                        <label style="display:block;font-size:12px;font-weight:bold;">Month:</label>
                        <input type="text" name="month" class="dash-input" placeholder="January, 2026" required>
                        <label style="display:block;font-size:12px;font-weight:bold;">Fee Amount:</label>
                        <input type="number" name="payable" class="dash-input" min="0" step="1" required>
                        <label style="display:block;font-size:12px;font-weight:bold;">Scholarship (optional):</label>
                        <input type="number" name="scholarship" class="dash-input" min="0" step="1" value="0">
                        <button type="submit" class="header-btn" style="border:none;cursor:pointer;background:#00796b;" onclick="return confirm('Apply this fee to every registered student?')">Add Fee to Everyone</button>
                    </form>
                </div>
            </div>
            <div style="margin-top:20px;overflow-x:auto;">
                <h5 style="margin:0 0 8px;">3. Fee Records — Search / Remove</h5>
                <input id="fee_record_search" type="text" class="dash-input" placeholder="Search User ID / Student ID / Name / Month" oninput="filterFeeRecords(this.value)">
                <table class="dash-table">
                    <tr><th>SI</th><th>User ID</th><th>Student Name</th><th>Month</th><th>Payable</th><th>Paid</th><th>Scholarship</th><th>Due</th><th>Action</th></tr>
                    ${tuition_fees.length ? tuition_fees.slice().reverse().map((fee, idx) => {
                        const st = students_list.find(s => s.id === fee.student_id);
                        const studentName = st ? st.name : 'Unknown';
                        return `<tr class="fee-record-row" data-search="${String(fee.student_id + ' ' + (st ? st.student_no : '') + ' ' + studentName + ' ' + fee.month).toLowerCase()}">
                            <td>${idx + 1}</td><td>${fee.student_id}</td><td>${studentName}</td><td>${fee.month}</td>
                            <td>${feeNumber(fee.payable).toFixed(0)}</td><td>${feeNumber(fee.paid).toFixed(0)}</td>
                            <td>${feeNumber(fee.scholarship).toFixed(0)}</td><td style="color:${feeDue(fee)>0?'#d00':'#16853a'};font-weight:bold;">${feeDue(fee).toFixed(0)}</td>
                            <td><form method="POST" style="margin:0;"><input type="hidden" name="action" value="delete_fee"><input type="hidden" name="fee_id" value="${fee.id}"><button type="submit" class="del-btn" onclick="return confirm('Delete this fee record?')">Delete</button></form></td>
                        </tr>`;
                    }).join('') : '<tr><td colspan="9" style="text-align:center;color:#666;">No fee records yet.</td></tr>'}
                </table>
            </div>
        </div>

        <div class="card">
            <form method="POST">
                <input type="hidden" name="action" value="delete_selected_students">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="color:#111111; margin:0;">5. Registered Students List</h4>
                    <button type="submit" class="del-btn" onclick="return confirm('Delete selected students?')">🗑 Delete Selected</button>
                </div>
                <table class="dash-table">
                    <tr>
                        <th style="width: 40px; text-align: center;"><input type="checkbox" id="select_all_students" onclick="toggleAllCheckboxes(this, 'selected_students')"></th>
                        <th>User ID</th><th>Password</th><th>Roll</th><th>Name</th><th>Class</th><th>Room</th><th>Student ID #</th><th>Action</th>
                    </tr>
                    ${studentsRows}
                </table>
            </form>
        </div>
    </div>
    <script>
        function filterFeeStudents(q) {
            q = (q || '').toLowerCase();
            const select = document.getElementById('fee_student_select');
            if (!select) return;
            Array.from(select.options).forEach(opt => {
                opt.hidden = q && opt.textContent.toLowerCase().indexOf(q) === -1;
            });
        }
        function filterFeeRecords(q) {
            q = (q || '').toLowerCase();
            document.querySelectorAll('.fee-record-row').forEach(row => {
                row.style.display = !q || row.getAttribute('data-search').indexOf(q) !== -1 ? '' : 'none';
            });
        }

        function toggleAllCheckboxes(source, checkboxName) {
            let checkboxes = document.getElementsByName(checkboxName);
            for(let i=0, n=checkboxes.length; i<n; i++) checkboxes[i].checked = source.checked;
        }
    </script>`;
    res.send(renderTemplate(body, req));
});

app.post('/dashboard', (req, res) => {
    if (!req.session.admin_logged) return res.redirect('/login?type=admin');
    let { action } = req.body;
    let successMsg = '';
    let aiResponse = '';

    if (action === 'start_exam') {
        const exam = getExam(req.body.exam_id);
        if (exam) {
            EXAMS.forEach(e => { exam_state[e.id].active = false; });
            active_exam_id = exam.id;
            exam_state[exam.id].active = true;
            exam_state[exam.id].startedAt = new Date().toISOString();
            savePortalData();
            successMsg = `${exam.title} started successfully. Admit Card and Marks Upload are now switched to this exam.`;
        }
    } else if (action === 'stop_exam') {
        const exam = getExam(req.body.exam_id);
        if (exam) {
            exam_state[exam.id].active = false;
            if (active_exam_id === exam.id) active_exam_id = null;
            savePortalData();
            successMsg = `${exam.title} stopped successfully.`;
        }
    } else if (action === 'publish_exam') {
        const exam = getExam(req.body.exam_id);
        if (exam) {
            exam_state[exam.id].published = true;
            exam_state[exam.id].publishedAt = new Date().toISOString();
            savePortalData();
            successMsg = `${exam.title} result published successfully.`;
        }
    } else if (action === 'unpublish_exam') {
        const exam = getExam(req.body.exam_id);
        if (exam) {
            exam_state[exam.id].published = false;
            exam_state[exam.id].publishedAt = null;
            savePortalData();
            successMsg = `${exam.title} result unpublished.`;
        }
    } else if (action === 'update_settings') {
        portal_settings.school_name = req.body.school_name;
        portal_settings.tagline = req.body.tagline;
        portal_settings.logo_type = req.body.logo_type;
        portal_settings.logo_text = req.body.logo_text;
        portal_settings.logo_url = req.body.logo_url;
        successMsg = 'Portal settings updated successfully!';
    } else if (action === 'update_home_content') {
        portal_settings.home_title = req.body.home_title || portal_settings.home_title;
        portal_settings.home_description = req.body.home_description || portal_settings.home_description;
        portal_settings.home_feature_title = req.body.home_feature_title || portal_settings.home_feature_title;
        portal_settings.home_feature_1 = req.body.home_feature_1 || portal_settings.home_feature_1;
        portal_settings.home_feature_2 = req.body.home_feature_2 || portal_settings.home_feature_2;
        portal_settings.home_feature_3 = req.body.home_feature_3 || portal_settings.home_feature_3;
        successMsg = 'Home page content updated successfully!';
    } else if (action === 'apply_preset_theme') {
        let t = PRESET_THEMES[req.body.preset_theme];
        if (t) {
            portal_settings.bg_color = t.bg_color;
            portal_settings.header_color = t.header_color;
            portal_settings.accent_color = t.accent_color;
            successMsg = `Theme applied successfully!`;
        }
    } else if (action === 'update_theme') {
        portal_settings.bg_color = req.body.bg_color;
        portal_settings.header_color = req.body.header_color;
        portal_settings.accent_color = req.body.accent_color;
        successMsg = 'Custom theme colors updated!';
    } else if (action === 'update_ai_prompt') {
        portal_settings.ai_prompt = req.body.ai_prompt;
        successMsg = 'AI prompt updated!';
    } else if (action === 'ask_ai') {
        let q = req.body.ai_query;
        aiResponse = `[নির্দেশনা কার্যকর]: ${portal_settings.ai_prompt}\n\n[উত্তর]: হ্যাঁ, আমি আপনার সাথে বাংলায় কথা বলছি! আপনি লিখেছেন: "${q}".`;
    } else if (action === 'add_notice') {
        let newNoticeText = req.body.notice_text;
        let newId = notice_board.length > 0 ? notice_board[notice_board.length - 1].id + 1 : 1;
        notice_board.push({ id: newId, text: newNoticeText });
        successMsg = 'নতুন নোটিশ সফলভাবে যোগ করা হয়েছে!';
    } else if (action === 'update_notice') {
        let nId = parseInt(req.body.notice_id);
        let noticeObj = notice_board.find(n => n.id === nId);
        if (noticeObj) {
            noticeObj.text = req.body.notice_text;
            successMsg = 'নোটিশ সফলভাবে আপডেট করা হয়েছে!';
        }
    } else if (action === 'delete_notice') {
        let nId = parseInt(req.body.notice_id);
        notice_board = notice_board.filter(n => n.id !== nId);
        successMsg = 'নোটিশ ডিলিট করা হয়েছে!';
    } else if (action === 'add_student') {
        students_list.push({
            id: req.body.student_id,
            pass: req.body.student_pass,
            roll: req.body.roll,
            name: req.body.name,
            class: req.body.class || 'Class 6',
            room: req.body.room,
            shift: req.body.shift || 'Day',
            religion: String(req.body.religion || 'Islam').trim() === 'Hindu' ? 'Hindu' : 'Islam',
            student_no: req.body.student_no,
            photo: req.body.photo || ''
        });
        successMsg = 'Student added successfully!';
    } else if (action === 'update_student_full') {
        let s = students_list.find(st => st.roll === req.body.target_roll);
        if (s) {
            s.name = req.body.new_name;
            s.roll = req.body.new_roll;
            s.id = req.body.new_id;
            s.pass = req.body.new_pass;
            s.room = req.body.new_room;
            successMsg = 'Student details updated!';
        }
    } else if (action === 'delete_student') {
        students_list = students_list.filter(s => s.roll !== req.body.target_roll);
        successMsg = 'Student deleted!';
    } else if (action === 'delete_selected_students') {
        let selected = req.body.selected_students || [];
        if (!Array.isArray(selected)) selected = [selected];
        students_list = students_list.filter(s => !selected.includes(s.roll));
        successMsg = 'Selected students deleted!';
    } else if (action === 'add_student_fee') {
        const st = students_list.find(s => s.id === req.body.student_id);
        if (st) {
            tuition_fees.push({
                id: 'fee_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                student_id: st.id,
                student_no: st.student_no,
                month: String(req.body.month || '').trim(),
                payable: feeNumber(req.body.payable),
                paid: Math.min(feeNumber(req.body.paid), feeNumber(req.body.payable)),
                scholarship: Math.min(feeNumber(req.body.scholarship), feeNumber(req.body.payable)),
                created_at: new Date().toISOString()
            });
            savePortalData();
            successMsg = `Tuition fee added for ${st.name}.`;
        } else {
            successMsg = 'Student not found.';
        }
    } else if (action === 'add_fee_all') {
        const payable = feeNumber(req.body.payable);
        const scholarship = Math.min(feeNumber(req.body.scholarship), payable);
        const month = String(req.body.month || '').trim();
        if (students_list.length === 0) {
            successMsg = 'No registered students found.';
        } else if (!month || payable <= 0) {
            successMsg = 'Enter a valid month and fee amount.';
        } else {
            const feeClass = String(req.body.fee_class || '').trim();
        const feeRoom = String(req.body.fee_room || '').trim();
        const feeShift = String(req.body.fee_shift || '').trim();
        const targetStudents = students_list.filter(st =>
            (!feeClass || String(st.class || '') === feeClass) &&
            (!feeRoom || String(st.room || '') === feeRoom) &&
            (!feeShift || String(st.shift || 'Day') === feeShift)
        );
        targetStudents.forEach(st => {
                tuition_fees.push({
                    id: 'fee_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                    student_id: st.id,
                    student_no: st.student_no,
                    month,
                    payable,
                    paid: 0,
                    scholarship,
                    created_at: new Date().toISOString()
                });
            });
            savePortalData();
            successMsg = `Fee of Tk. ${payable.toFixed(0)} added for all ${students_list.length} students.`;
        }
    } else if (action === 'delete_fee') {
        tuition_fees = tuition_fees.filter(f => f.id !== req.body.fee_id);
        savePortalData();
        successMsg = 'Tuition fee record deleted.';

    } else if (action === 'add_teacher') {
        let teacherSubjects = [req.body.teacher_subject1, req.body.teacher_subject2, req.body.teacher_subject3]
            .map(s => String(s || '').trim()).filter(Boolean);
        teacherSubjects = [...new Set(teacherSubjects)].slice(0, 3);

        teachers_list.push({
            id: req.body.teacher_id,
            pass: req.body.teacher_pass,
            name: req.body.teacher_name,
            phone: req.body.teacher_phone,
            subjects: teacherSubjects,
            subject: teacherSubjects.join(', ')
        });
        successMsg = `Teacher account created with ${teacherSubjects.length} subject${teacherSubjects.length === 1 ? '' : 's'}!`;
    } else if (action === 'update_teacher') {
        const originalId = String(req.body.original_teacher_id || '').trim();
        const newId = String(req.body.teacher_id || '').trim();
        const newPass = String(req.body.teacher_pass || '').trim();
        const newName = String(req.body.teacher_name || '').trim();
        const newPhone = String(req.body.teacher_phone || '').trim();
        let teacherSubjects = [req.body.teacher_subject1, req.body.teacher_subject2, req.body.teacher_subject3]
            .map(s => String(s || '').trim()).filter(Boolean);
        teacherSubjects = [...new Set(teacherSubjects)].slice(0, 3);
        const teacher = teachers_list.find(t => String(t.id) === originalId);
        if (!teacher) {
            successMsg = 'Teacher not found.';
        } else if (!newId || !newPass || !newName || !newPhone) {
            successMsg = 'Teacher ID, password, name and phone are required.';
        } else if (newId !== originalId && teachers_list.some(t => String(t.id) === newId)) {
            successMsg = 'This Teacher ID is already in use.';
        } else {
            teacher.id = newId;
            teacher.pass = newPass;
            teacher.name = newName;
            teacher.phone = newPhone;
            teacher.subjects = teacherSubjects;
            teacher.subject = teacherSubjects.join(', ');
            if (Array.isArray(uploaded_sheets)) {
                uploaded_sheets.forEach(sheet => { if (String(sheet.teacher_id) === originalId) sheet.teacher_id = newId; });
            }
            successMsg = 'Teacher information updated successfully.';
        }
    } else if (action === 'delete_teacher') {
        teachers_list = teachers_list.filter(t => t.id !== req.body.teacher_id);
        successMsg = 'Teacher deleted!';
    } else if (action === 'delete_selected_teachers') {
        let selected = req.body.selected_teachers || [];
        if (!Array.isArray(selected)) selected = [selected];
        teachers_list = teachers_list.filter(t => !selected.includes(t.id));
        successMsg = 'Selected teachers deleted!';
    }

    savePortalData();
    res.redirect(`/dashboard?msg=${encodeURIComponent(successMsg)}&ai_response=${encodeURIComponent(aiResponse)}`);
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login?type=student');
    });
});

app.listen(PORT, () => {
    console.log("==================================================");
    console.log("  Dev.Center Software by NIGHT CLOUD Running!     ");
    console.log("  Node.js Server URL: http://127.0.0.1:" + PORT + "  ");
    console.log("==================================================");
});
