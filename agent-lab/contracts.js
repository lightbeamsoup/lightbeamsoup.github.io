const str = (maxLength=200) => ({type:'string',minLength:1,maxLength});
const schema = (properties={},required=[]) => ({type:'object',properties,required,additionalProperties:false});
export const tools = [
  {name:'get_identity',description:'Read the signed-in sandbox identity and hierarchy role.',inputSchema:schema(),readOnly:true},
  {name:'list_employees',description:'List employees visible under your current hierarchy permissions. Use IDs to distinguish names.',inputSchema:schema(),readOnly:true},
  {name:'list_goals',description:'Search visible employee goals, including versions and permitted actions.',inputSchema:schema({employee:str(),query:str(),status:{type:'string',enum:['overdue','in_progress','complete']}}),readOnly:true},
  {name:'get_goal',description:'Read one permitted goal, its notes, and current version.',inputSchema:schema({id:str()},['id']),readOnly:true},
  {name:'create_goal',description:'Assign a goal to an employee you supervise. Commits a new goal; retries must reuse the idempotency key.',inputSchema:schema({employee:str(),title:str(160),target:str(300),due:{type:'string',format:'date'},idempotencyKey:str(128)},['employee','title','target','due','idempotencyKey'])},
  {name:'update_progress',description:'Commit progress and a note to your own goal. Read its version first. Reuse the idempotency key on retries.',inputSchema:schema({id:str(),version:{type:'integer',minimum:1},progress:{type:'integer',minimum:0,maximum:100},note:str(2000),idempotencyKey:str(128)},['id','version','progress','note','idempotencyKey'])},
  {name:'add_feedback',description:'Commit supervisor feedback on a goal within your management scope. Requires its current version.',inputSchema:schema({id:str(),version:{type:'integer',minimum:1},note:str(2000),idempotencyKey:str(128)},['id','version','note','idempotencyKey'])},
  {name:'set_manager',description:'Administrator only: change a reporting relationship within the same department. An empty manager removes the relationship.',inputSchema:schema({employee:str(),manager:{type:'string',maxLength:200},idempotencyKey:str(128)},['employee','manager','idempotencyKey'])}
];
