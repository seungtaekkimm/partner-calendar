
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const app = express();
const db = new Database('partner-calendar.db');
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '2580';

app.use(express.json({limit:'8mb'}));
app.use(express.static(path.join(__dirname, 'public')));

db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  time TEXT,
  place TEXT,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  company TEXT NOT NULL,
  position TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  UNIQUE(event_id, company, position, name)
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  company TEXT NOT NULL,
  position TEXT NOT NULL,
  name TEXT NOT NULL,
  text TEXT,
  images TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

function adminOK(req){
  return req.headers['x-admin-pin'] === ADMIN_PIN;
}
function uid(){ return crypto.randomUUID(); }

app.get('/api/events', (req,res)=>{
  const events = db.prepare('SELECT * FROM events ORDER BY start_date,time').all();
  const responses = db.prepare('SELECT * FROM responses').all();
  const reviews = db.prepare('SELECT * FROM reviews ORDER BY created_at DESC').all();
  for(const e of events){
    e.responses = responses.filter(r=>r.event_id===e.id);
    e.reviews = reviews.filter(r=>r.event_id===e.id).map(r=>({...r, images: JSON.parse(r.images||'[]')}));
  }
  res.json(events);
});

app.post('/api/admin/login',(req,res)=>{
  res.json({ok: req.body.pin === ADMIN_PIN});
});

app.post('/api/events',(req,res)=>{
  if(!adminOK(req)) return res.status(403).json({error:'admin only'});
  const {category,title,start_date,end_date,time,place,description}=req.body;
  if(!title||!start_date) return res.status(400).json({error:'missing fields'});
  const id=uid();
  db.prepare(`INSERT INTO events(id,category,title,start_date,end_date,time,place,description)
              VALUES(?,?,?,?,?,?,?,?)`).run(id,category||'other',title,start_date,end_date||start_date,time||'',place||'',description||'');
  res.json({ok:true,id});
});

app.put('/api/events/:id',(req,res)=>{
  if(!adminOK(req)) return res.status(403).json({error:'admin only'});
  const {category,title,start_date,end_date,time,place,description}=req.body;
  db.prepare(`UPDATE events SET category=?,title=?,start_date=?,end_date=?,time=?,place=?,description=? WHERE id=?`)
    .run(category||'other',title,start_date,end_date||start_date,time||'',place||'',description||'',req.params.id);
  res.json({ok:true});
});

app.delete('/api/events/:id',(req,res)=>{
  if(!adminOK(req)) return res.status(403).json({error:'admin only'});
  const id=req.params.id;
  const tx=db.transaction(()=>{
    db.prepare('DELETE FROM responses WHERE event_id=?').run(id);
    db.prepare('DELETE FROM reviews WHERE event_id=?').run(id);
    db.prepare('DELETE FROM events WHERE id=?').run(id);
  }); tx();
  res.json({ok:true});
});

app.post('/api/events/:id/rsvp',(req,res)=>{
  const {company,position,name,status}=req.body;
  if(!company||!position||!name||!['참석','불참'].includes(status)) return res.status(400).json({error:'bad request'});
  const existing=db.prepare('SELECT id,status FROM responses WHERE event_id=? AND company=? AND position=? AND name=?')
    .get(req.params.id,company,position,name);
  if(existing && existing.status===status){
    db.prepare('DELETE FROM responses WHERE id=?').run(existing.id);
  }else if(existing){
    db.prepare('UPDATE responses SET status=? WHERE id=?').run(status,existing.id);
  }else{
    db.prepare('INSERT INTO responses(id,event_id,company,position,name,status) VALUES(?,?,?,?,?,?)')
      .run(uid(),req.params.id,company,position,name,status);
  }
  res.json({ok:true});
});

app.post('/api/events/:id/reviews',(req,res)=>{
  const {company,position,name,text,images}=req.body;
  if(!company||!position||!name) return res.status(400).json({error:'missing profile'});
  db.prepare('INSERT INTO reviews(id,event_id,company,position,name,text,images) VALUES(?,?,?,?,?,?,?)')
    .run(uid(),req.params.id,company,position,name,text||'',JSON.stringify(images||[]));
  res.json({ok:true});
});

app.listen(PORT, ()=>console.log(`Partner Calendar: http://localhost:${PORT}`));
