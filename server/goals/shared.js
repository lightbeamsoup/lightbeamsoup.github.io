export class AppError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
export const fail=(status,message)=>{throw new AppError(status,message);};
export function validate(schema,input){
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Expected a JSON object.');
  for(const key of Object.keys(input))if(!Object.hasOwn(schema.properties,key))fail(400,`Unknown field: ${key}`);
  for(const key of schema.required)if(!Object.hasOwn(input,key))fail(400,`Missing field: ${key}`);
  for(const [key,value] of Object.entries(input)){
    const s=schema.properties[key];
    if(s.type==='string'&&(typeof value!=='string'||value.length<(s.minLength||0)||value.length>(s.maxLength||10000)||(s.minLength&&!value.trim())))fail(400,`Invalid ${key}.`);
    if(s.type==='integer'&&(!Number.isInteger(value)||value<s.minimum||(s.maximum!==undefined&&value>s.maximum)))fail(400,`Invalid ${key}.`);
    if(s.enum&&!s.enum.includes(value))fail(400,`Invalid ${key}.`);
    if(s.format==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))fail(400,`Invalid ${key}. Use YYYY-MM-DD.`);
  }
  return input;
}
export const authSchema={type:'object',properties:{workspace:{type:'string',minLength:1,maxLength:100},email:{type:'string',minLength:1,maxLength:150},password:{type:'string',minLength:1,maxLength:200}},required:['workspace','email','password']};
export const fixtures=[
  ['admin','Jordan Blake','Operations','admin',null],
  ['maya','Maya Patel','Engineering','head',null],
  ['evan','Evan Brooks','Engineering','supervisor','maya'],
  ['alex-r','Alex Rivera','Engineering','employee','evan'],
  ['priya','Priya Shah','Engineering','employee','evan'],
  ['noah','Noah Williams','Customer Success','head',null],
  ['lena','Lena Ortiz','Customer Success','supervisor','noah'],
  ['alex-c','Alex Chen','Customer Success','employee','lena'],
  ['sam','Sam Taylor','Customer Success','employee','lena']
];
export function canSee(people,actor,id){
  if(actor.role==='admin'||actor.id===id)return true;
  let person=people.find(p=>p.id===id);
  if(actor.role==='supervisor')return person?.manager===actor.id;
  if(actor.role!=='head')return false;
  const seen=new Set();
  while(person?.manager&&!seen.has(person.id)){
    seen.add(person.id);if(person.manager===actor.id)return true;
    person=people.find(p=>p.id===person.manager);
  }
  return false;
}
export const manages=(people,actor,id)=>actor.role==='admin'||(actor.id!==id&&canSee(people,actor,id)&&['head','supervisor'].includes(actor.role));
