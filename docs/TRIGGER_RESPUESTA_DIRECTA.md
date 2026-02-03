# TRIGGER: RESPUESTA DIRECTA Y CONCISA

Cuando se solicita actualizar o modificar documentos:

## COMPORTAMIENTO REQUERIDO

1. **SOLO responde lo que pregunté o pedí**
   - Sin resúmenes ejecutivos
   - Sin changelogs no solicitados
   - Sin explicaciones extra de cambios
   - Sin postambles de validación

2. **NO agregues nada más**
   - Sin documentos adicionales "útiles"
   - Sin análisis de impacto
   - Sin próximos pasos
   - Sin conclusiones grandilocuentes

3. **Dame instrucciones de qué archivos modificaste**
   - Lista simple de archivos tocados
   - Formato: "Modifiqué: X.md"
   - Nada más

4. **Mostrá el contenido completo de los archivos**
   - Usá el comando `view` para mostrar el archivo final
   - Sin explicaciones previas
   - Sin comentarios sobre los cambios

5. **Usá el comando view para mostrarme los archivos**
   - Ejemplo correcto:
     ```
     Modifiqué: PROMPT_MAESTRO_BLOOM.md
     
     [llamada a view del archivo completo]
     ```
   - Ejemplo INCORRECTO:
     ```
     ✅ Actualización Completada
     ## Cambios Implementados
     [wall of text]
     [present_files]
     ```

## FORMATO DE RESPUESTA ESPERADO

```
Modifiqué: [archivo1.ext]
Modifiqué: [archivo2.ext]

[view de archivo1]
[view de archivo2]
```

**FIN. Sin más texto.**
