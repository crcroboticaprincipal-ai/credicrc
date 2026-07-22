# Informe de Presentación del Proyecto: Ecosistema Financiero CrediCRC

**Para:** Equipo Directivo y Junta Administradora del Colegio Rafael Castillo  
**Asunto:** Plataforma Interna de Financiamiento y Compras de Alimentos ("Compra Ahora, Paga Después")  
**Fecha:** Junio de 2026  
**Estatus del Sistema:** 100% Desarrollado y Operativo en Producción  

---

## 1. Resumen Ejecutivo
**CrediCRC** es una solución digital de bienestar social diseñada exclusivamente para el personal docente, administrativo y obrero de nuestra institución. Consiste en una plataforma Fintech de financiamiento a corto plazo sin intereses cobrados por mora, indexada a la tasa oficial del Banco Central de Venezuela (BCV), que permite a los trabajadores adquirir alimentos de primera necesidad en comercios aliados y pagarlos cómodamente mediante descuento directo de nómina.

El sistema promueve una relación **Ganar-Ganar-Ganar** entre el colegio, el personal escolar y los comercios locales autorizados, garantizando transparencia, seguridad en el manejo de límites y automatización del proceso de nómina.

---

## 2. El Desafío y la Oportunidad
El personal escolar enfrenta dificultades económicas por la inflación y la pérdida del poder adquisitivo. Muchas veces requieren adquirir alimentos y víveres a crédito, lo cual suele acarrear recargos elevados o procesos de cobro informales y desgastantes. 

Por otro lado, los comercios locales buscan clientes recurrentes pero temen asumir riesgos de impago. 

**CrediCRC resuelve esto al actuar como un intermediario tecnológico seguro:**
1. El colegio respalda y automatiza la deducción del pago directamente del sueldo quincenal del trabajador.
2. El comercio vende con la garantía de cobro respaldada por la institución.
3. El trabajador obtiene comida sin pagar de más y sin endeudarse por encima de sus posibilidades reales.

---

## 3. Funcionamiento General del Ecosistema (Paso a Paso)

El sistema funciona de manera digital a través de teléfonos inteligentes y computadoras, sin necesidad de instalar aplicaciones pesadas, bajo un flujo seguro en 4 pasos:

```
[Trabajador] genera código QR de identidad (expira en 5 min)
     ↓
[Comercio Aliado] escanea el QR en su POS digital e ingresa el monto total de la venta
     ↓
[Sistema] calcula inicial requerida (según nivel) y valida disponibilidad de cupo
     ↓
[Comercio] recauda la inicial física en caja, procesa la venta, y el colegio garantiza el saldo neto
```

### Reglas de Seguridad Financiera y Gamificación (Niveles de Crédito):
Para proteger el sueldo del personal y promover una cultura de pago responsable, se implementó un sistema gamificado de **4 Niveles de Crédito** que reemplaza los límites estáticos:

1.  **Nivel 1 (Básico):** El trabajador financia hasta el **15.0%** de su salario quincenal base. Requiere pagar obligatoriamente el **40% de inicial** en efectivo/transferencia al comercio.
2.  **Nivel 2 (Confiable):** El límite de financiamiento sube al **16.5%** de su salario quincenal base. La inicial requerida baja al **35% de la compra**.
3.  **Nivel 3 (Preferente):** El límite de financiamiento sube al **18.5%** de su salario quincenal base. La inicial requerida baja al **30% de la compra**.
4.  **Nivel 4 (Élite):** El límite de financiamiento alcanza el **20.0%** de su salario quincenal base. La inicial requerida baja al **20% de la compra**.

*   **Ascenso de Nivel:** El sistema evalúa el comportamiento de pago de forma automática. Al cancelar las cuotas puntualmente en nómina, el trabajador sube de nivel y desbloquea mejores condiciones.
*   **Penalización por Mora (Bloqueo de QR):** Si el trabajador tiene quincenas vencidas sin conciliar, su código QR se bloquea automáticamente por seguridad. Se desbloquea en tiempo real una vez que se ponga al día o ascienda de nivel.

---

## 4. Beneficios y Características del Ecosistema

### A. Para la Institución (Colegio Rafael Castillo)
*   **Apoyo Social Directo:** Ofrece una alternativa real y controlada contra la usura comercial externa, apoyando la alimentación del personal.
*   **Control y Automatización:** Generación del reporte consolidado de nómina listo para importar a Excel con un clic.
*   **Sostenibilidad Operativa y Comisión Acumulada:** En lugar de cobrar comisiones inmediatas que resten fluidez al comercio, las comisiones (de 3% a 5%) se acumulan a lo largo del mes. El comercio cuenta con un reporte financiero transparente y realiza una única transferencia consolidad al colegio a inicio de mes.
*   **Control Total de Proveedores (Panel Admin):** La directiva cuenta con una herramienta CRUD completa para agregar nuevos comercios, editar sus tasas de comisión y actualizar sus datos de cuenta. El sistema incluye una salvaguarda de eliminación segura: bloquea el borrado de proveedores con transacciones registradas para prevenir daños en la integridad de la base de datos.
*   **Editor de Contenidos:** Modificación directa de textos y políticas institucionales de la web desde el panel sin requerir servicios de desarrollo de software.

### B. Para los Trabajadores (Docentes y Administrativos)
*   **Crédito Justo sin Intereses:** Financiamiento sin tasas de interés adicionales, permitiendo estirar el presupuesto familiar.
*   **Indexación BCV:** Saldos en dólares para protección inflacionaria del comercio, cancelados en Bolívares calculados de forma exacta a la tasa oficial del BCV del día de cobro.
*   **Identificación QR Simple:** Proceso de compra ágil de un solo botón. No requiere ingresar montos ni plazos; todo es calculado por el POS del comercio.

### C. Para los Comercios Aliados (Víveres y Carnes)
*   **Garantía y Flujo:** Cobro asegurado mediante deducción de nómina quincenal, eliminando el riesgo de cartera vencida.
*   **Reportes Financieros Transparentes:** Pestaña interactiva con selector de mes para auditar ventas brutas, montos liquidados y comisiones pendientes por pagar al colegio con los datos bancarios escolares visibles.
*   **POS Flexible:** Switch de control para decidir si requiere cobrar el abono sugerido ("Aplica Inicial") o eximirlo temporalmente para la venta ("Inicial Cero"), adaptándose a la realidad comercial de cada transacción.

---

## 5. Privacidad y Seguridad del Sistema
La seguridad informática y la experiencia de usuario se han blindado con los siguientes lineamientos:
1.  **Aprobación Administrativa Directa:** Toda cuenta de trabajador o proveedor recién registrada se crea en estado inactivo. Debe ser validada y activada por el colegio antes de operar.
2.  **Ocultación de Infraestructuras:** Mensajes de error amigables sin referencias a bases de datos, APIs o proveedores de hosting externos para prevenir vulnerabilidades de información.
3.  **Foco de Teclado Móvil Optimizado:** Se solucionó el error de layout en dispositivos móviles donde el teclado virtual desplazaba y descolocaba los campos de entrada de login, manteniendo un comportamiento estable para mayor fluidez.
4.  **Autenticación en Controles Críticos:** Los modos de simulación y restablecimiento del sistema están encriptados y restringidos al panel del administrador de la junta.


---

## 6. Estado Técnico del Proyecto
*   **Dirección Web Pública (Ya en línea)**: [https://credicrc.vercel.app](https://credicrc.vercel.app)
*   **Código de Resguardo en GitHub**: [https://github.com/crcroboticaprincipal-ai/credicrc.git](https://github.com/crcroboticaprincipal-ai/credicrc.git)
*   **Base de datos**: Totalmente configurada en tiempo real. 

---

## 7. Plan de Adopción Recomendado
Para el lanzamiento oficial, se sugiere seguir estos tres sencillos pasos:
1.  **Afiliación de Comercios**: Invitar a los comercios seleccionados (víveres y carnes) a registrarse desde la web y aprobarlos en el panel asignando su respectiva comisión.
2.  **Registro de Trabajadores**: Pedir a los docentes y administrativos que ingresen a la plataforma y completen el registro de su cuenta desde sus teléfonos.
3.  **Activación de Nómina**: El administrador aprueba las solicitudes en el panel ingresando los salarios base reales para que el sistema asigne sus límites de consumo automáticamente.
