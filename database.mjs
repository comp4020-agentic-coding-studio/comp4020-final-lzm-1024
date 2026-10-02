// Cache statements, never their results: permissions, sessions and writes stay live.
export function createQueries(db,{capacity=256}={}){
  const statements=new Map();
  function prepare(sql){
    let statement=statements.get(sql);
    if(statement){statements.delete(sql);statements.set(sql,statement);return statement;}
    statement=db.prepare(sql);statements.set(sql,statement);
    if(statements.size>capacity)statements.delete(statements.keys().next().value);
    return statement;
  }
  return {
    get:(sql,...params)=>prepare(sql).get(...params),
    all:(sql,...params)=>prepare(sql).all(...params),
    run:(sql,...params)=>prepare(sql).run(...params),
    clear:()=>statements.clear(),
    get size(){return statements.size;}
  };
}
