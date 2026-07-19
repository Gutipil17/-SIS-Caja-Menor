SIS CAJA MENOR v1.2 - LISTA PARA SUBIR A GITHUB

FUNCIONES INCLUIDAS
- Registro diario de gastos desde iPhone, iPad o computador.
- Fecha automática y orden cronológico.
- Campos: ciudad, tipo de soporte, concepto, detalle, tercero, tipo y número de identificación y valor.
- Para Taxi exige nombre del conductor y número de cédula.
- Escaneo con cámara o selección de imágenes.
- Adjunta PDF de varias páginas.
- Firma individual de recibos con dedo o Apple Pencil.
- Historial local y copia de seguridad JSON.
- Generación del Excel oficial SCOF01 usando la plantilla entregada.
- Generación de un PDF completo con:
  1. Relación principal SCOF01.
  2. Recibos de caja ordenados por fecha, 4 por hoja o 3 cuando el concepto es largo.
  3. Facturas y soportes escaneados, ordenados cronológicamente.

SUBIR A GITHUB SIN VISUAL STUDIO
1. Descomprima este ZIP en el Mac.
2. Abra el repositorio SIS-Caja-Menor en github.com.
3. Pulse Add file > Upload files.
4. Abra la carpeta descomprimida. Seleccione TODO lo que está dentro: index.html, app.js, styles.css, service-worker.js, manifest.webmanifest y las carpetas assets y vendor.
5. Arrastre esos elementos al área de carga de GitHub. No suba el ZIP y no suba la carpeta contenedora completa como una sola carpeta. index.html debe quedar visible en la raíz del repositorio.
6. En Commit changes escriba: Versión 1.2 inicial.
7. Pulse Commit changes.

ACTIVAR GITHUB PAGES
1. Dentro del repositorio pulse Settings.
2. En el menú izquierdo pulse Pages.
3. En Build and deployment, Source: Deploy from a branch.
4. Branch: main. Carpeta: /(root).
5. Pulse Save.
6. Espere de 1 a 5 minutos.
7. La dirección será normalmente:
   https://gutipil17.github.io/SIS-Caja-Menor/

INSTALAR EN IPHONE O IPAD
1. Abra la dirección anterior únicamente en Safari.
2. Pulse Compartir.
3. Pulse Añadir a pantalla de inicio.
4. Pulse Agregar.

IMPORTANTE
- La primera apertura necesita internet para cargar las librerías de Excel y PDF.
- Los datos se guardan en el dispositivo. Antes de borrar Safari o cambiar de teléfono use Crear copia de seguridad.
- No cambie los nombres ni la ubicación de los archivos dentro del proyecto.
