export function cityLockupSize(name:string):"short"|"medium"|"long"{
  const length=name.trim().length;
  return length>10?"long":length>7?"medium":"short";
}
