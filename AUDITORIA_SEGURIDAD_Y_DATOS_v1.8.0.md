# Auditoría de SIS Gastos / Caja Menor

Fecha: 24 de julio de 2026  
Versión revisada: 1.7.9  
Versión local corregida: 1.8.0

## Resultado ejecutivo

La versión 1.7.9 funciona como una PWA local, pero no debe considerarse todavía un sistema corporativo seguro. Guarda cédulas, facturas, firmas y datos contables sin cifrar en el navegador y no tiene autenticación, autorización por roles, bitácora inalterable ni sincronización central. Estas limitaciones no se resuelven únicamente con cambios de interfaz: requieren una arquitectura con servidor, identidad corporativa y base de datos cifrada.

La versión local 1.8.0 reduce los riesgos que sí pueden corregirse manteniendo la arquitectura actual: elimina datos personales y matrículas del repositorio público, incorpora localmente las dependencias, refuerza la política de contenido, valida restauraciones y evita exportaciones incompletas o contablemente incoherentes.

## Hallazgos críticos

1. **Información sensible sin cifrar ni control de acceso.** IndexedDB conserva identificaciones, firmas y soportes completos. Cualquier persona con acceso al perfil del navegador o al dispositivo desbloqueado puede consultarlos. Estado: pendiente de rediseño.
2. **Sin usuarios, roles ni trazabilidad.** No existe separación entre responsable, aprobador y contabilidad; tampoco una bitácora confiable de creación, edición, eliminación o exportación. Estado: pendiente de rediseño.
3. **Riesgo de pérdida por almacenamiento exclusivamente local.** Borrar datos del navegador, perder el dispositivo o agotar la cuota puede eliminar la información. La copia de seguridad es manual y contiene datos sensibles en JSON sin cifrar. Estado: mitigado parcialmente; pendiente respaldo corporativo cifrado.

## Hallazgos altos corregidos en 1.8.0

1. **Movimientos omitidos silenciosamente.** El formato solo escribe 43 filas para Caja Menor y 30 para Viáticos, pero antes aceptaba más movimientos y los restantes no aparecían en la salida contable. Ahora la exportación se bloquea y explica que el informe debe dividirse.
2. **Dependencias remotas.** PDF, Excel y lectura de PDF dependían de jsDelivr. Esto afectaba privacidad, disponibilidad y operación sin conexión. Ahora las versiones exactas están incluidas en `vendor/` y en la caché de la PWA.
3. **Datos personales y flota en el repositorio público.** El responsable y seis matrículas estaban preconfigurados en el código. Se retiraron; la persona usuaria debe diligenciarlos en el dispositivo.
4. **Restauración demasiado permisiva.** Se aceptaban archivos con estructura mínima y se reemplazaban registros coincidentes sin advertencia. Ahora se exige formato y versión compatibles, se validan informes y movimientos, se limita el archivo a 100 MB y se pide confirmación.
5. **Salida contable incoherente.** Ahora se impide exportar con saldo negativo, gastos fuera del periodo, informe sin movimientos, lugar vacío o responsable vacío.
6. **Valores monetarios débiles.** Antes cualquier número no nulo podía guardarse, incluidos valores negativos o decimales. Ahora el gasto debe ser un entero positivo seguro.
7. **Política web abierta.** Se añadió una política de seguridad de contenido, bloqueo de referencias salientes y carga exclusiva desde el mismo origen.

## Hallazgos medios y recomendaciones

- La copia de seguridad actual corresponde solo al módulo activo. Conviene ofrecer una copia integral cifrada de Caja Menor y Viáticos, con comprobación de integridad.
- Al restaurar, los informes con el mismo identificador se reemplazan. La advertencia evita sorpresas, pero una futura versión debería mostrar una comparación y permitir “omitir”, “duplicar” o “reemplazar”.
- Las fotografías se convierten a JPEG; esto elimina parte de los metadatos, pero también puede reducir legibilidad. Se requiere prueba con facturas reales y límites explícitos por archivo, páginas y tamaño total.
- Los recibos pueden descargarse sin firma después de una confirmación. La política de la compañía debe definir si esto debe bloquearse completamente.
- La eliminación de informes y movimientos es definitiva. Se recomienda papelera temporal y bitácora de auditoría.
- No existe control de consecutivos corporativos. Los números `RC-001` se recalculan según el informe y pueden repetirse entre informes.
- La fecha usada en “Lugar y fecha” solo conserva el lugar; debe confirmarse con Contabilidad si el formato exige también fecha de elaboración.
- Las categorías están fijas en el código. Deben alinearse con el plan de cuentas y políticas internas.

## Organización recomendada

### Etapa 1 — PWA local controlada

- Publicar 1.8.0 solo para pruebas internas.
- Definir propietario funcional, responsable técnico y aprobador contable.
- Confirmar formato SCOF01, topes, categorías, consecutivos y tratamiento de recibos sin firma.
- Probar respaldo y restauración en iPhone/iPad reales antes de uso productivo.

### Etapa 2 — Aplicación corporativa

- Inicio de sesión con identidad corporativa y segundo factor.
- Roles: solicitante, responsable de caja, aprobador, contabilidad y auditor.
- API y base de datos cifrada; archivos en almacenamiento privado con enlaces temporales.
- Bitácora inalterable de cambios, aprobaciones, exportaciones y eliminaciones.
- Retención, borrado y respaldo conforme a la política de tratamiento de datos.
- Alertas por duplicados, topes, periodos cerrados y consecutivos.

### Etapa 3 — Operación y cumplimiento

- Revisión de seguridad independiente.
- Pruebas de recuperación ante pérdida de dispositivo o corrupción.
- Monitoreo, gestión de vulnerabilidades y actualización periódica de dependencias.
- Procedimiento de incidentes y responsable de privacidad.

## Pruebas realizadas

- Validación de sintaxis de JavaScript.
- Verificación de consistencia de versión, caché y recursos sin conexión.
- Búsqueda de datos personales, matrículas y dependencias remotas.
- Carga real en navegador local sin errores de consola.
- Navegación de Caja Menor, pantalla de informe y estado de actualización.
- Comprobaciones estáticas automatizadas en `tests/static-checks.mjs`.

## Criterio de publicación

La versión 1.8.0 es apropiada para una prueba interna controlada en un dispositivo administrado, siempre que se cree una copia de seguridad frecuente y se acepte que los datos permanecen sin cifrar en el navegador. No se recomienda como sistema corporativo definitivo ni para múltiples usuarios hasta implementar la Etapa 2.
