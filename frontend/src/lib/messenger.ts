type Conversation={is_group?:boolean;name?:string;unread?:number;user?:{full_name?:string;username?:string}};
export type MessengerConversation={id:string;unread:number;updated_at:string;last_message?:string;muted?:boolean;online?:boolean} & (
 {is_group:true;name:string;avatar?:string;member_count:number} |
 {is_group?:false;user:{id:string;full_name:string;username:string;avatar?:string;blue_tick_active?:boolean;verification_badge?:string}}
);
export function filterConversations<T extends Conversation>(rows:T[],search:string,filter:'all'|'unread'|'groups'):T[]{
 const query=search.trim().toLocaleLowerCase();
 return rows.filter(row=>{
  if(filter==='unread'&&!(Number(row.unread)>0))return false;
  if(filter==='groups'&&!row.is_group)return false;
  const name=row.is_group?(row.name||'Group chat'):[row.user?.full_name,row.user?.username].filter(Boolean).join(' ');
  return name.toLocaleLowerCase().includes(query);
 });
}
