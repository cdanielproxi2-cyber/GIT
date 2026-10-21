// ===================== ESTADO =====================

// Clave con la que se guarda el tablero en localStorage
const CLAVE_STORAGE = "kanban-estado";

// Prioridades disponibles: la clave se usa en el estado y en las clases CSS,
// el valor es el texto que se le muestra al usuario
const PRIORIDADES = { urgente: "Urgente", media: "Media", baja: "Baja" };

// Contenedor donde se dibujan todas las columnas
const tablero = document.getElementById("tablero");

// Botón del header para añadir una columna nueva
const btnNuevaColumna = document.getElementById("btn-nueva-columna");

// Estado central: arreglo de columnas, cada una con { id, titulo, tarjetas: [{ id, texto, prioridad }] }
let columnas = cargarEstado();

// Guarda qué tarjeta se está arrastrando y de qué columna sale ({ tarjetaId, columnaId }).
// Vale null cuando no se está arrastrando nada.
let arrastrando = null;

// Genera un id único combinando la fecha actual con un trozo aleatorio
function generarId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Lee el estado desde localStorage. Si no hay nada (o está dañado),
// devuelve el tablero inicial con tres columnas vacías
function cargarEstado() {
    try {
        const guardado = JSON.parse(localStorage.getItem(CLAVE_STORAGE));
        if (Array.isArray(guardado)) return guardado;
    } catch (error) {
        console.warn("No se pudo leer el estado guardado", error);
    }
    // Estado inicial
    return [
        { id: generarId(), titulo: "Por hacer", tarjetas: [] },
        { id: generarId(), titulo: "En progreso", tarjetas: [] },
        { id: generarId(), titulo: "Hecho", tarjetas: [] }
    ];
}

// Guarda el estado actual en localStorage.
// Se llama después de cada cambio (crear, mover, borrar, editar)
function guardarEstado() {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(columnas));
}

// Devuelve la columna del estado que coincide con el id
function buscarColumna(id) {
    return columnas.find(columna => columna.id === id);
}

// ===================== FÁBRICA DE COMPONENTES =====================

// Crea un elemento HTML con clase y texto opcionales (evita repetir createElement)
function crearElemento(etiqueta, clase, texto) {
    const elemento = document.createElement(etiqueta);
    if (clase) elemento.className = clase;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
}

// Construye una columna completa: encabezado (título editable, contador, borrar),
// zona droppable con sus tarjetas y el pie con el botón "Añadir tarjeta"
function crearColumna(columna) {
    const seccion = crearElemento("section", "columna");
    seccion.dataset.id = columna.id;

    // Encabezado: título editable + contador + borrar
    const encabezado = crearElemento("div", "columna-encabezado");
    const titulo = crearElemento("h2", "columna-titulo", columna.titulo);
    titulo.title = "Doble clic para editar";
    titulo.addEventListener("dblclick", () => {
        editarTexto(titulo, nuevoTitulo => {
            columna.titulo = nuevoTitulo;
            guardarEstado();
        });
    });

    const contador = crearElemento("span", "contador", columna.tarjetas.length);

    const btnBorrar = crearElemento("button", "btn-icono", "🗑");
    btnBorrar.title = "Borrar columna";
    btnBorrar.addEventListener("click", () => {
        if (confirm(`¿Borrar la columna "${columna.titulo}" y sus tarjetas?`)) {
            columnas = columnas.filter(c => c.id !== columna.id);
            guardarEstado();
            renderizar();
        }
    });

    encabezado.append(titulo, contador, btnBorrar);

    // Zona droppable con las tarjetas
    const zona = crearElemento("div", "zona-tarjetas");
    if (columna.tarjetas.length === 0) {
        zona.appendChild(crearElemento("p", "vacio", "No hay tarjetas"));
    }
    columna.tarjetas.forEach(tarjeta => zona.appendChild(crearTarjeta(tarjeta, columna)));
    configurarZonaDrop(zona, columna);

    // Pie: botón "Añadir tarjeta" / formulario inline
    const pie = crearElemento("div", "columna-pie");
    const btnAnadir = crearElemento("button", "btn-anadir", "+ Añadir tarjeta");
    btnAnadir.addEventListener("click", () => {
        btnAnadir.hidden = true;
        const formulario = crearFormulario(columna, () => {
            formulario.remove();
            btnAnadir.hidden = false;
        });
        pie.appendChild(formulario);
    });
    pie.appendChild(btnAnadir);

    seccion.append(encabezado, zona, pie);
    return seccion;
}

// Construye una tarjeta: etiqueta de prioridad, botón de borrar,
// texto editable y los eventos de arrastre
function crearTarjeta(tarjeta, columna) {
    const elemento = crearElemento("article", `tarjeta prioridad-${tarjeta.prioridad}`);
    elemento.draggable = true;
    elemento.dataset.id = tarjeta.id;

    const encabezado = crearElemento("div", "tarjeta-encabezado");
    const etiqueta = crearElemento("span", "etiqueta", PRIORIDADES[tarjeta.prioridad]);
    const btnBorrar = crearElemento("button", "btn-icono", "✕");
    btnBorrar.title = "Borrar tarjeta";
    btnBorrar.addEventListener("click", () => {
        columna.tarjetas = columna.tarjetas.filter(t => t.id !== tarjeta.id);
        guardarEstado();
        renderizar();
    });
    encabezado.append(etiqueta, btnBorrar);

    const texto = crearElemento("p", "tarjeta-texto", tarjeta.texto);
    texto.title = "Doble clic para editar";
    texto.addEventListener("dblclick", () => {
        editarTexto(texto, nuevoTexto => {
            tarjeta.texto = nuevoTexto;
            guardarEstado();
        });
    });

    // Drag and Drop (Opción A)
    elemento.addEventListener("dragstart", evento => {
        evento.dataTransfer.setData("text/plain", tarjeta.id);
        evento.dataTransfer.effectAllowed = "move";
        arrastrando = { tarjetaId: tarjeta.id, columnaId: columna.id };
        // El setTimeout evita que la "imagen fantasma" del arrastre salga con la opacidad baja
        setTimeout(() => elemento.classList.add("arrastrando"), 0);
    });
    elemento.addEventListener("dragend", () => {
        elemento.classList.remove("arrastrando");
        arrastrando = null;
    });

    elemento.append(encabezado, texto);
    return elemento;
}

// Construye el formulario inline para añadir una tarjeta (texto + prioridad + Guardar/Cancelar).
// "alCerrar" es la función que se ejecuta al cancelar para quitar el formulario
function crearFormulario(columna, alCerrar) {
    const formulario = crearElemento("div", "form-inline");

    const campoTexto = document.createElement("input");
    campoTexto.type = "text";
    campoTexto.placeholder = "Escribe la tarea...";
    campoTexto.maxLength = 120;

    const selector = document.createElement("select");
    Object.entries(PRIORIDADES).forEach(([valor, nombre]) => {
        const opcion = document.createElement("option");
        opcion.value = valor;
        opcion.textContent = nombre;
        selector.appendChild(opcion);
    });
    selector.value = "media";

    const mensajeError = crearElemento("small", "error");

    // Valida que el texto no esté vacío, agrega la tarjeta al estado y vuelve a dibujar
    const guardar = () => {
        const texto = campoTexto.value.trim();
        if (texto === "") {
            mensajeError.textContent = "La tarjeta no puede estar vacía";
            campoTexto.focus();
            return;
        }
        columna.tarjetas.push({ id: generarId(), texto, prioridad: selector.value });
        guardarEstado();
        renderizar();
    };

    const btnGuardar = crearElemento("button", "btn-guardar", "Guardar");
    btnGuardar.addEventListener("click", guardar);
    const btnCancelar = crearElemento("button", "btn-cancelar", "Cancelar");
    btnCancelar.addEventListener("click", alCerrar);

    // Enter guarda y Escape cancela
    campoTexto.addEventListener("keydown", evento => {
        if (evento.key === "Enter") guardar();
        if (evento.key === "Escape") alCerrar();
    });

    const botones = crearElemento("div", "form-botones");
    botones.append(btnGuardar, btnCancelar);

    formulario.append(campoTexto, selector, mensajeError, botones);
    setTimeout(() => campoTexto.focus(), 0);
    return formulario;
}

// ===================== EDICIÓN INLINE =====================

// Cambia un elemento de texto por un input. Enter o perder el foco guardan,
// Escape cancela. "alGuardar" recibe el texto nuevo para actualizar el estado
function editarTexto(elemento, alGuardar) {
    // Si está dentro de una tarjeta arrastrable, la desactivamos mientras se edita
    const arrastrable = elemento.closest("[draggable]");
    if (arrastrable) arrastrable.draggable = false;

    const campo = document.createElement("input");
    campo.type = "text";
    campo.className = "input-edicion";
    campo.value = elemento.textContent;
    elemento.replaceWith(campo);
    campo.focus();
    campo.select();

    // La bandera evita que "terminar" se ejecute dos veces (por ejemplo Enter y luego blur)
    let terminado = false;
    const terminar = guardar => {
        if (terminado) return;
        terminado = true;
        const nuevoTexto = campo.value.trim();
        if (guardar && nuevoTexto !== "") {
            elemento.textContent = nuevoTexto;
            alGuardar(nuevoTexto);
        }
        campo.replaceWith(elemento);
        if (arrastrable) arrastrable.draggable = true;
    };

    campo.addEventListener("blur", () => terminar(true));
    campo.addEventListener("keydown", evento => {
        if (evento.key === "Enter") terminar(true);
        if (evento.key === "Escape") terminar(false);
    });
}

// ===================== DRAG AND DROP =====================

// Calcula en qué posición de la columna cae la tarjeta soltada,
// comparando la posición vertical del mouse con el centro de cada tarjeta
function calcularIndice(zona, posicionY) {
    // Posición de la tarjeta soltada entre las que ya están en la columna
    const tarjetasDom = [...zona.querySelectorAll(".tarjeta:not(.arrastrando)")];
    const indice = tarjetasDom.findIndex(tarjeta => {
        const caja = tarjeta.getBoundingClientRect();
        return posicionY < caja.top + caja.height / 2;
    });
    return indice === -1 ? tarjetasDom.length : indice;
}

// Convierte la zona de tarjetas de una columna en un receptor de drops:
// la saca del estado de la columna origen y la mete en esta
function configurarZonaDrop(zona, columna) {
    // dragover: preventDefault es obligatorio para que el navegador permita soltar aquí
    zona.addEventListener("dragover", evento => {
        evento.preventDefault();
        zona.classList.add("sobre");
    });

    // dragleave: quita el resaltado solo si el mouse salió realmente de la zona
    zona.addEventListener("dragleave", evento => {
        if (!zona.contains(evento.relatedTarget)) zona.classList.remove("sobre");
    });

    // drop: mueve la tarjeta en el estado, guarda y vuelve a dibujar
    zona.addEventListener("drop", evento => {
        evento.preventDefault();
        if (!arrastrando) return;

        const columnaOrigen = buscarColumna(arrastrando.columnaId);
        const posicion = columnaOrigen.tarjetas.findIndex(t => t.id === arrastrando.tarjetaId);
        if (posicion === -1) return;

        const [tarjetaMovida] = columnaOrigen.tarjetas.splice(posicion, 1);
        const indice = calcularIndice(zona, evento.clientY);
        columna.tarjetas.splice(indice, 0, tarjetaMovida);

        guardarEstado();
        renderizar();
    });
}

// ===================== RENDER =====================

// Vacía el tablero y lo vuelve a dibujar completo a partir del estado
function renderizar() {
    tablero.innerHTML = "";
    columnas.forEach(columna => tablero.appendChild(crearColumna(columna)));
}

// Añade una columna nueva al final y hace scroll para que se vea
btnNuevaColumna.addEventListener("click", () => {
    columnas.push({ id: generarId(), titulo: "Nueva columna", tarjetas: [] });
    guardarEstado();
    renderizar();
    tablero.scrollLeft = tablero.scrollWidth;
});

// Primer dibujo al cargar la página
renderizar();