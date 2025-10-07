export function CodeGenerator():string{
  const defaultCharacters ="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result ='';
  for(let i=0;i<6;i++){
    const randomIndex = Math.floor(Math.random()*defaultCharacters.length);
    result+=defaultCharacters[randomIndex];
  }
return result;
}