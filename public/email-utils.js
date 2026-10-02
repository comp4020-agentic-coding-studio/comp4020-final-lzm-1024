// Shared by registration UI and server. Only explicit university domains match.
export const normalizeEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';
export function validEmail(value){
  const email=normalizeEmail(value);
  if(email.length>254)return false;
  const parts=email.split('@');if(parts.length!==2)return false;
  const [local,domain]=parts;
  if(!local||local.length>64||local.startsWith('.')||local.endsWith('.')||local.includes('..')||!/^[-a-z0-9.!#$%&'*+/=?^_`{|}~]+$/i.test(local))return false;
  const labels=domain.split('.');
  return labels.length>=2&&labels.every(label=>label.length<=63&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))&&/^[a-z]{2,63}$/i.test(labels.at(-1));
}
export function universityFromEmail(value,universities){
  if(!validEmail(value))return null;
  const domain=normalizeEmail(value).split('@')[1];
  return universities.find(u=>u.emailDomains?.includes(domain))||null;
}
