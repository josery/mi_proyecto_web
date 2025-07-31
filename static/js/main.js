document.addEventListener('DOMContentLoaded', function() {
    // --- VARIABLES GLOBALES ---
    let projectData = {};
    let taskTable;
    let ganttChart;
    let pieChart;
    let selectedRow = null; 
    let currentProjectFilename = 'proyecto_ejemplo.json';

    // --- ELEMENTOS DEL DOM ---
    const loadButton = document.getElementById('load-button');
    const saveButton = document.getElementById('save-button');
    const saveAsButton = document.getElementById('save-as-button');
    const addActivityBtn = document.getElementById('add-activity-btn');
    const addTaskBtn = document.getElementById('add-task-btn');
    const addSubtaskBtn = document.getElementById('add-subtask-btn');
    const editTaskBtn = document.getElementById('edit-task-btn');
    const deleteTaskBtn = document.getElementById('delete-task-btn');
    const moveUpBtn = document.getElementById('move-up-btn');
    const moveDownBtn = document.getElementById('move-down-btn');
    const indentBtn = document.getElementById('indent-btn');
    const unindentBtn = document.getElementById('unindent-btn');
    const projectTitleEl = document.getElementById('project-title');
    
    const taskModalEl = document.getElementById('task-modal');
    const taskModal = new bootstrap.Modal(taskModalEl);
    const saveTaskBtn = document.getElementById('save-task-btn');
    const taskForm = document.getElementById('task-form');
    const modalTitle = document.getElementById('modal-title');
    const taskIdInput = document.getElementById('task-id');
    const parentIdInput = document.getElementById('parent-id');
    const taskTitleInput = document.getElementById('task-title');
    const taskResponsableInput = document.getElementById('task-responsable');
    const taskInicioInput = document.getElementById('task-inicio');
    const taskFinPrevistoInput = document.getElementById('task-fin-previsto');
    const taskFinRealInput = document.getElementById('task-fin-real');
    const taskAvanceInput = document.getElementById('task-avance');

    const ganttContainer = document.getElementById('gantt-chart');
    const pieChartCanvas = document.getElementById('pie-chart').getContext('2d');

    // --- FUNCIÓN AUXILIAR PARA NOTIFICACIONES ---
    function showToast(message, type = 'info') {
        const toastContainer = document.querySelector('.toast-container');
        if (!toastContainer) return;
        const toastId = `toast-${Date.now()}`;
        const toastClass = { success: 'text-bg-success', error: 'text-bg-danger', info: 'text-bg-primary', warning: 'text-bg-warning' }[type] || 'text-bg-secondary';
        const toastHTML = `<div id="${toastId}" class="toast ${toastClass}" role="alert" aria-live="assertive" aria-atomic="true"><div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div></div>`;
        toastContainer.insertAdjacentHTML('beforeend', toastHTML);
        const toastEl = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastEl, { delay: 5000 });
        toast.show();
        toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
    }

    // --- LÓGICA DE MANEJO DE TAREAS ---
    const toInputDate = (dateStr) => {
        if (!dateStr) return '';
        const parts = dateStr.split('/');
        return parts.length !== 3 ? '' : `20${parts[2]}-${parts[1]}-${parts[0]}`;
    };

    const fromInputDate = (dateStr) => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        return parts.length !== 3 ? '' : `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
    };

    function openTaskModalForCreate(parentId = "") {
        taskForm.reset();
        taskIdInput.value = '';
        parentIdInput.value = parentId;
        modalTitle.textContent = parentId ? `Añadir Tarea a "${projectData.tasks.find(t => t.id === parentId).data.titulo}"` : "Añadir Nueva Actividad";
        taskModal.show();
    }

    function openTaskModalForEdit() {
        if (!selectedRow) return;
        taskForm.reset();
        const task = selectedRow.getData();
        taskIdInput.value = task.id;
        parentIdInput.value = task.parent || '';
        modalTitle.textContent = `Editando: "${task.data.titulo}"`;
        taskTitleInput.value = task.data.titulo;
        taskResponsableInput.value = task.data.responsable;
        taskAvanceInput.value = parseFloat(task.data.avance_reportado) || 0;
        taskInicioInput.value = toInputDate(task.data.inicio);
        taskFinPrevistoInput.value = toInputDate(task.data.fin_previsto);
        taskFinRealInput.value = toInputDate(task.data.fin_real);
        taskModal.show();
    }

    function saveTask() {
        const id = taskIdInput.value;
        const title = taskTitleInput.value;
        const responsable = taskResponsableInput.value;
        if (!title || !responsable) {
            return showToast("Título y Responsable son obligatorios.", "warning");
        }

        if (id) {
            const task = projectData.tasks.find(t => t.id === id);
            if (task) {
                Object.assign(task.data, { 
                    titulo: title, 
                    responsable, 
                    avance_reportado: `${taskAvanceInput.value}%`, 
                    inicio: fromInputDate(taskInicioInput.value), 
                    fin_previsto: fromInputDate(taskFinPrevistoInput.value), 
                    fin_real: fromInputDate(taskFinRealInput.value) 
                });
                recalculateTaskState(task.data);
                taskTable.getRow(id).update({ data: task.data });
                showToast(`Tarea "${title}" actualizada.`, "success");
            }
        } else {
            const parentId = parentIdInput.value;
            const newId = generateNextEdt(parentId);
            const newTask = { 
                id: newId, 
                parent: parentId, 
                data: { 
                    titulo: title, 
                    responsable, 
                    edt: newId, 
                    avance_reportado: `${taskAvanceInput.value || 0}%`, 
                    inicio: fromInputDate(taskInicioInput.value), 
                    fin_previsto: fromInputDate(taskFinPrevistoInput.value), 
                    fin_real: fromInputDate(taskFinRealInput.value) 
                } 
            };
            recalculateTaskState(newTask.data);
            projectData.tasks.push(newTask);
            if (parentId) {
                taskTable.getRow(parentId).addTreeChild(newTask).then(r => r.treeExpand());
            } else {
                taskTable.addRow(newTask, true);
            }
            showToast(`Nueva tarea "${title}" creada.`, "success");
        }
        renderAllComponents();
        taskModal.hide();
    }

    function generateNextEdt(parentId) {
        const siblings = projectData.tasks.filter(t => t.parent === parentId);
        if (parentId) {
            const parentTask = projectData.tasks.find(t => t.id === parentId);
            const maxSub = siblings.reduce((max, t) => Math.max(max, parseInt(t.id.split('.').pop() || 0)), 0);
            return `${parentTask.id}.${maxSub + 1}`;
        } else {
            const maxActivity = siblings.reduce((max, t) => Math.max(max, parseInt(t.id.split('.')[0] || 0)), 0);
            return `${maxActivity + 1}.0`;
        }
    }
    
    function deleteTask() {
        if (!selectedRow) return;
        const task = selectedRow.getData();
        if (confirm(`¿Seguro que quieres eliminar "${task.data.titulo}" y todas sus subtareas?`)) {
            const idsToDelete = new Set([task.id]);
            (function findChildren(pId) { 
                projectData.tasks.filter(t => t.parent === pId).forEach(c => { 
                    idsToDelete.add(c.id); 
                    findChildren(c.id); 
                }); 
            })(task.id);
            projectData.tasks = projectData.tasks.filter(t => !idsToDelete.has(t.id));
            selectedRow.delete();
            renderAllComponents();
            updateButtonStates(null);
            showToast(`Tarea "${task.data.titulo}" eliminada.`, "info");
        }
    }

    function moveTaskUp() { if (selectedRow) selectedRow.move(selectedRow.getPrevRow(), false); }
    function moveTaskDown() { if (selectedRow) selectedRow.move(selectedRow.getNextRow(), true); }
    function indentTask() { if (selectedRow) selectedRow.move(selectedRow.getPrevRow(), "last"); }
    function unindentTask() { if (selectedRow && selectedRow.getParentRow()) selectedRow.move(selectedRow.getParentRow(), "after"); }
    
    function updateButtonStates(row) {
        selectedRow = row;

        if (!row) {
            addTaskBtn.disabled = true;
            addSubtaskBtn.disabled = true;
            editTaskBtn.disabled = true;
            deleteTaskBtn.disabled = true;
            moveUpBtn.disabled = true;
            moveDownBtn.disabled = true;
            indentBtn.disabled = true;
            unindentBtn.disabled = true;
            return;
        }

        const taskData = row.getData();
        const isActivity = taskData.data.edt.endsWith('.0');

        editTaskBtn.disabled = false;
        deleteTaskBtn.disabled = false;
        
        addTaskBtn.disabled = !isActivity;
        addSubtaskBtn.disabled = isActivity;
        
        moveUpBtn.disabled = !row.getPrevRow();
        moveDownBtn.disabled = !row.getNextRow();
        indentBtn.disabled = !row.getPrevRow();
        unindentBtn.disabled = !row.getParentRow();
    }

    function getProjectDataForSave() {
        if (!taskTable) return projectData;
        const flattenTree = (nodes) => {
            return nodes.reduce((acc, node) => {
                const { _children, ...rest } = node;
                acc.push(rest);
                if (_children && _children.length > 0) {
                    acc = acc.concat(flattenTree(_children));
                }
                return acc;
            }, []);
        };
        const tableData = taskTable.getData(true);
        const flattenedData = flattenTree(tableData);
        
        const finalTasks = flattenedData.map(d => ({
            id: d.id,
            parent: d.parent,
            data: d.data
        }));

        return { ...projectData, tasks: finalTasks };
    }

    async function saveProjectData() {
        try {
            const response = await fetch('/api/project/save', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ filename: currentProjectFilename, projectData: getProjectDataForSave() }) 
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            showToast(result.message, "success");
        } catch (error) { 
            showToast(`Error al guardar: ${error.message}`, "error"); 
        }
    }

    async function saveProjectAs() {
        const filename = prompt("Introduce el nuevo nombre del archivo:", currentProjectFilename);
        if (!filename) return;
        try {
            const response = await fetch('/api/project/save_as', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ filename, data: getProjectDataForSave() }) 
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            currentProjectFilename = filename.endsWith('.json') ? filename : filename + '.json';
            projectTitleEl.textContent = `AgilePlanner: ${currentProjectFilename}`;
            showToast(`${result.message}`, "success");
        } catch (error) { 
            showToast(`Error en 'Guardar Como': ${error.message}`, "error"); 
        }
    }

    async function loadProjectData(filename = null) {
        const url = filename ? `/api/project/load_specific/${filename}` : '/api/project/load';
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            projectData = data;
            currentProjectFilename = filename || 'proyecto_ejemplo.json';
            projectTitleEl.textContent = `AgilePlanner: ${currentProjectFilename}`;
            renderAllComponents();
            showToast(`Proyecto "${currentProjectFilename}" cargado.`, 'info');
        } catch (error) { 
            showToast(`Error al cargar: ${error.message}`, "error"); 
        }
    }

    function handleLoadProject() { 
        const f = prompt("Nombre del archivo a cargar:", "proyecto_ejemplo.json"); 
        if (f) loadProjectData(f); 
    }

    function renderAllComponents() { 
        renderTaskTable(); 
        renderGantt(); 
        renderPieChart(); 
    }

    const parseDateForCalc = (dateStr) => {
        if (!dateStr) return null;
        const parts = dateStr.split('/');
        return parts.length !== 3 ? null : new Date(`20${parts[2]}`, parts[1] - 1, parts[0]);
    };

    function recalculateTaskState(data) {
        const inicio = parseDateForCalc(data.inicio);
        const finPrevisto = parseDateForCalc(data.fin_previsto);
        const finReal = parseDateForCalc(data.fin_real);
        data.duracion = (inicio && finPrevisto && finPrevisto >= inicio) ? Math.ceil((finPrevisto - inicio) / 864e5) + 1 : "N/D";
        data.porcentaje = finReal ? "100%" : `${parseFloat(data.avance_reportado) || 0}%`;
        if (!data.avance_reportado) data.avance_reportado = data.porcentaje;
        data.estado = finReal ? (finPrevisto && finReal <= finPrevisto ? "COMPLETADA A TIEMPO" : "COMPLETADA CON RETRASO") : (inicio ? (finPrevisto && finPrevisto < new Date().setHours(0,0,0,0) ? "ATRASADA" : "ACTIVA") : "PENDIENTE");
    }

    // Custom formatter for traffic light progress column
    function trafficLightFormatter(cell) {
        const value = cell.getValue();
        const progress = parseFloat(value) || 0;
        
        let color;
        if (progress >= 0 && progress <= 29) {
            color = "#DB4437"; // Red
        } else if (progress >= 30 && progress <= 69) {
            color = "#F2C037"; // Yellow
        } else if (progress >= 70 && progress <= 100) {
            color = "#68B04D"; // Green
        } else {
            color = "#e0e0e0"; // Gray for invalid values
        }
        
        return `<div style="display: flex; align-items: center; justify-content: center;">
                    <div style="width: 20px; height: 20px; border-radius: 50%; background-color: ${color}; margin-right: 8px; border: 1px solid #ccc;"></div>
                    <span>${value}</span>
                </div>`;
    }

    function renderTaskTable() {
        const buildTree = (tasks) => {
            const taskMap = tasks.reduce((map, task) => {
                map[task.id] = { ...task, _children: [] };
                return map;
            }, {});
            const tree = [];
            tasks.forEach(task => {
                if (task.parent && taskMap[task.parent]) {
                    taskMap[task.parent]._children.push(taskMap[task.id]);
                } else {
                    tree.push(taskMap[task.id]);
                }
            });
            return tree;
        };
        const treeData = buildTree(projectData.tasks || []);
        
        taskTable = new Tabulator("#task-table", {
            data: treeData, 
            dataTree: true, 
            dataTreeStartExpanded: true, 
            // movableRows: true,  // <-- ESTA LÍNEA HA SIDO ELIMINADA. ES LA CAUSA DEL ERROR.
            selectableRows: 1, 
            layout: "fitColumns",
            columns: [ 
                { title: "Título", field: "data.titulo", width: 300, editor: "input" }, 
                { title: "EDT", field: "data.edt", width: 80 }, 
                { title: "Responsable", field: "data.responsable", width: 150, editor: "input" }, 
                { title: "Inicio", field: "data.inicio", hozAlign: "center", editor: "input" }, 
                { title: "Fin Previsto", field: "data.fin_previsto", hozAlign: "center", editor: "input" }, 
                { title: "Fin Real", field: "data.fin_real", hozAlign: "center", editor: "input" }, 
                { title: "Duración", field: "data.duracion", width: 90, hozAlign: "center" }, 
                { title: "% Avance", field: "data.avance_reportado", hozAlign: "center", width: 120, editor: "input", formatter: trafficLightFormatter }, 
                { title: "Estado", field: "data.estado" }, 
            ],
            dataTreeRowMoved: (row) => {
                const movedTask = row.getData();
                const parentRow = row.getParentRow();
                movedTask.parent = parentRow ? parentRow.getData().id : "";

                const reassignChildrenEdt = (parentTaskData, parentRowComponent) => {
                    parentRowComponent.getChildren().forEach((childRow, index) => {
                        const childTaskData = childRow.getData();
                        const newId = `${parentTaskData.id}.${index + 1}`;
                        childTaskData.id = newId;
                        childTaskData.data.edt = newId;
                        childRow.update({id: newId, data: childTaskData.data});
                        if(childRow.getChildren().length > 0) {
                            reassignChildrenEdt(childTaskData, childRow);
                        }
                    });
                };
                
                taskTable.getRows().forEach((topLevelRow, index) => {
                    const topLevelTaskData = topLevelRow.getData();
                    const newId = `${index + 1}.0`;
                    topLevelTaskData.id = newId;
                    topLevelTaskData.data.edt = newId;
                    topLevelRow.update({id: newId, data: topLevelTaskData.data});
                    reassignChildrenEdt(topLevelTaskData, topLevelRow);
                });

                projectData.tasks = getProjectDataForSave().tasks;
                updateButtonStates(row);
            },
            cellEdited: (cell) => { 
                const data = cell.getRow().getData().data; 
                recalculateTaskState(data); 
                cell.getRow().update({data: data}); 
                renderGantt(); 
            },
            rowSelected: function(row){
                updateButtonStates(row);
            },
            rowDeselected: function(row){
                updateButtonStates(null);
            }
        });
    }

    function renderGantt() {
        if (!projectData.tasks || ganttContainer.closest('.tab-pane').style.display === 'none') return;
        const parseDate = (dateStr) => {
            if (!dateStr) return null;
            const parts = dateStr.split('/');
            return parts.length !== 3 ? null : `20${parts[2]}-${parts[1]}-${parts[0]}`;
        };
        const gantt_tasks = (projectData.tasks || []).map(task => ({
            id: task.id, name: task.data.titulo, start: parseDate(task.data.inicio),
            end: parseDate(task.data.fin_previsto),
            progress: parseFloat(task.data.avance_reportado) || 0,
            dependencies: task.data.dependencia || ''
        })).filter(t => t.start && t.end);
        ganttContainer.innerHTML = '';
        if (gantt_tasks.length > 0) {
            ganttChart = new Gantt("#gantt-chart", gantt_tasks, { view_mode: 'Day', language: 'es' });
        }
    }

    function renderPieChart() {
        if (!projectData.tasks) return;
        const topLevelActivities = (projectData.tasks || []).filter(task => !task.parent);
        const labels = topLevelActivities.map(task => task.data.titulo);
        const data = topLevelActivities.map(task => parseFloat(task.data.avance_reportado) || 0);
        if (pieChart) pieChart.destroy();
        pieChart = new Chart(pieChartCanvas, {
            type: 'pie',
            data: { 
                labels, 
                datasets: [{ 
                    label: 'Avance Reportado', 
                    data, 
                    backgroundColor: ['rgba(54, 162, 235, 0.8)','rgba(255, 206, 86, 0.8)','rgba(75, 192, 192, 0.8)','rgba(153, 102, 255, 0.8)','rgba(255, 99, 132, 0.8)','rgba(255, 159, 64, 0.8)'] 
                }] 
            },
            options: { responsive: true, plugins: { legend: { position: 'top' }, title: { display: true, text: 'Avance por Actividad Principal' } } }
        });
    }

    // --- EVENT LISTENERS ---
    loadButton.addEventListener('click', handleLoadProject);
    saveButton.addEventListener('click', saveProjectData);
    saveAsButton.addEventListener('click', saveProjectAs);
    addActivityBtn.addEventListener('click', () => openTaskModalForCreate());
    addTaskBtn.addEventListener('click', () => { if (selectedRow) openTaskModalForCreate(selectedRow.getData().id); });
    addSubtaskBtn.addEventListener('click', () => { if (selectedRow) openTaskModalForCreate(selectedRow.getData().id); });
    editTaskBtn.addEventListener('click', openTaskModalForEdit);
    deleteTaskBtn.addEventListener('click', deleteTask);
    moveUpBtn.addEventListener('click', moveTaskUp);
    moveDownBtn.addEventListener('click', moveTaskDown);
    indentBtn.addEventListener('click', indentTask);
    unindentBtn.addEventListener('click', unindentTask);
    saveTaskBtn.addEventListener('click', saveTask);

    // --- INICIALIZACIÓN ---
    loadProjectData();
});