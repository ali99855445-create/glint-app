/** Community media stores a file path, never the uploader's bearer token. */
export function resolveFileUrl(api:string,path:string|null|undefined,token?:string|null):string|undefined {
 if(!path)return undefined;
 if(/^https?:\/\//.test(path))return path;
 const url=path.startsWith('/api/')?api.replace(/\/api$/,'')+path:api+(path.startsWith('/')?'':'/')+path;
 return /\/api\/files\//.test(url)&&token?url+(url.includes('?')?'&':'?')+'token='+encodeURIComponent(token):url;
}
