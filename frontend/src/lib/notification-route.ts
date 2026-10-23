type Notification = {type?:string;ref_id?:string;route?:string;actor?:{username?:string};text?:string};
export function notificationRoute(n:Notification):string {
  if(n.route && /^\/(post|user|chat(?:\/group)?|community)\/[a-zA-Z0-9_%?=&-]+$/.test(n.route))return n.route;
  if(n.route && ['/(tabs)/friends','/(tabs)/profile','/verification','/help'].includes(n.route))return n.route;
  const ref=n.ref_id?encodeURIComponent(n.ref_id):undefined;
  if(['reaction','comment','spark'].includes(n.type||'')&&ref)return `/post/${ref}`;
  if(n.type==='friend_request')return '/(tabs)/friends';
  if(['follow','friend_accept'].includes(n.type||''))return n.actor?.username?`/user/${encodeURIComponent(n.actor.username)}`:'/(tabs)/friends';
  if(n.type==='message'&&ref)return `/chat/${ref}`;
  if(n.type?.startsWith('community')&&ref)return `/community/${ref}`;
  if(n.type==='admin'){
    if(/verif|badge|blue tick/i.test(n.text||''))return '/verification';
    if(/profile information/i.test(n.text||''))return '/(tabs)/profile';
  }
  return '/help';
}
