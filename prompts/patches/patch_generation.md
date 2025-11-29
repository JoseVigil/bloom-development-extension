Genera un patch en formato unified diff (RFC 2396) válido y aplicable con el comando 'patch'.

REGLAS OBLIGATORIAS:
1. Formato estricto: líneas de contexto con espacio al inicio, líneas eliminadas con '-', líneas agregadas con '+'
2. Headers @@ completos con números correctos de línea y cantidad
3. Incluye 3 líneas de contexto antes y después de cada cambio
4. Sin texto explicativo fuera del diff (solo dentro del código si es necesario)

COMENTARIOS:
- Puedes incluir comentarios SOLO si son parte del código fuente que se está modificando
- Usa la sintaxis de comentarios correcta según el lenguaje del archivo:
  * JavaScript/TypeScript/JSON con comentarios: // comentario
  * Python: # comentario
  * HTML/XML: <!-- comentario -->
  * CSS: /* comentario */
  * Shell/Bash: # comentario
  * Ruby: # comentario
  * Java/C/C++: // comentario o /* comentario */
- NO agregues comentarios en las líneas del diff (las que empiezan con +, -, o espacio)

FORMATO DE SALIDA:
```diff
diff --git a/ruta/archivo.ext b/ruta/archivo.ext
index 0000000..1111111 100644
--- a/ruta/archivo.ext
+++ b/ruta/archivo.ext
@@ -inicio,cantidad +inicio,cantidad @@
 contexto
-línea eliminada
+línea agregada con // comentario si es código JS
 contexto
```

NO incluyas explicaciones antes o después del diff. Solo el diff puro.