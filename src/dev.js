// Testmodus: Testszenarien und alle Test-Parameter (?scene, ?cash, ?battle …, siehe README) gibt es nur mit ?dev
// (lokal über "Core Business Testmodus.bat", auf GitHub Pages durch Anhängen von ?dev an die Adresse).
// Ohne ?dev werden sie ignoriert und der Knopf "Testszenarien" fehlt.
export const DEV = new URLSearchParams(location.search).has('dev');

// URL-Parameter des Testmodus (ohne Testmodus leer)
export const devParams = () => new URLSearchParams(DEV ? location.search : '');
