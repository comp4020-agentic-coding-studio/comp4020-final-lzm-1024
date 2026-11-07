// Daily copies of the database in /data/backups, kept for seven days. They protect against a bad
// change or a bug noticed within a week. They live on the same volume as the database, so Fly's
// own volume snapshots remain the protection against losing the volume itself. Uploaded images
// are not copied here; the volume snapshots cover them.
import {copyFileSync,existsSync,mkdirSync,readdirSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {basename,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const backupName=/^campuswall-\d{4}-\d{2}-\d{2}\.sqlite$/;
export const backupDir=dataDir=>join(dataDir,'backups');

export function createBackups({db,dataDir,keep=7,today=()=>new Date().toISOString().slice(0,10),log=console}){
  const dir=backupDir(dataDir);
  // One copy per day; VACUUM INTO writes a consistent copy while the app keeps running.
  function backup(){
    mkdirSync(dir,{recursive:true});
    const file=join(dir,`campuswall-${today()}.sqlite`);if(existsSync(file))return null;
    const partial=file+'.partial';rmSync(partial,{force:true});
    db.exec(`VACUUM INTO '${partial.replace(/'/g,"''")}'`);renameSync(partial,file);prune();return file;
  }
  function prune(){for(const name of readdirSync(dir).filter(name=>backupName.test(name)).sort().slice(0,-keep))rmSync(join(dir,name),{force:true});}
  function schedule(delayMs=60000){
    const run=()=>{try{const file=backup();if(file)log.info?.(`Database backup written: ${basename(file)}`);}catch(error){log.error?.(`Database backup failed: ${error.message}`);}};
    setTimeout(run,delayMs).unref();setInterval(run,6*3600000).unref();
  }
  return {backup,prune,schedule,dir};
}

// Restore runs before the database opens, at most once per backup: set RESTORE_FROM to a backup's
// file name, restart, then remove the setting. The database being replaced is kept beside it.
export function restoreOnce(dataDir,name,log=console){
  if(!name)return false;
  if(!backupName.test(name))throw Error(`RESTORE_FROM must name a file in ${backupDir(dataDir)}, such as campuswall-2026-11-07.sqlite`);
  const source=join(backupDir(dataDir),name),marker=join(backupDir(dataDir),`restored-${name}.txt`);
  if(existsSync(marker)){log.info?.(`${name} was already restored; remove RESTORE_FROM to silence this message.`);return false;}
  if(!existsSync(source))throw Error(`Backup not found: ${name}`);
  const check=new DatabaseSync(source,{readOnly:true});
  try{const result=check.prepare('PRAGMA integrity_check').get();if(Object.values(result)[0]!=='ok')throw Error(`Backup failed its integrity check: ${name}`);}finally{check.close();}
  const live=join(dataDir,'campuswall.sqlite'),kept=`${live}.before-restore-${Date.now()}`;
  if(existsSync(live))renameSync(live,kept);
  for(const suffix of ['-wal','-shm'])if(existsSync(live+suffix))renameSync(live+suffix,kept+suffix);
  copyFileSync(source,live);writeFileSync(marker,`Restored ${name} at ${new Date().toISOString()}. The previous database was kept as ${basename(kept)}.\n`);
  log.info?.(`Restored ${name}; the previous database is kept as ${basename(kept)}.`);
  return true;
}
