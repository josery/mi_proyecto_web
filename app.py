import os
import json
from flask import Flask, render_template, request, jsonify, send_from_directory

app = Flask(__name__)
DEFAULT_PROJECT_FILE = "proyecto_ejemplo.json"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/project/load', methods=['GET'])
def load_default_project():
    if not os.path.exists(DEFAULT_PROJECT_FILE):
        return jsonify({"info_general": {}, "tasks": []})
    return send_from_directory('.', DEFAULT_PROJECT_FILE)

@app.route('/api/project/load_specific/<path:filename>', methods=['GET'])
def load_specific_project(filename):
    if '..' in filename or os.path.isabs(filename):
        return jsonify({"error": "Acceso no permitido."}), 400
    
    if not filename.lower().endswith('.json'):
        filename += '.json'

    if not os.path.exists(filename):
        return jsonify({"error": f"El archivo '{filename}' no fue encontrado."}), 404
    
    return send_from_directory('.', filename)

@app.route('/api/project/save', methods=['POST'])
def save_project():
    data = request.get_json()
    filename = data.get('filename', DEFAULT_PROJECT_FILE)
    project_data = data.get('projectData')

    if '..' in filename or os.path.isabs(filename):
        return jsonify({"error": "Acceso no permitido."}), 400

    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(project_data, f, indent=4, ensure_ascii=False)
        return jsonify({"message": f"Proyecto guardado en '{filename}'."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/project/save_as', methods=['POST'])
def save_project_as():
    payload = request.get_json()
    filename = payload.get('filename')
    project_data = payload.get('data')

    if not filename or not project_data:
        return jsonify({"error": "Solicitud inválida."}), 400

    if '..' in filename or os.path.isabs(filename):
        return jsonify({"error": "Nombre de archivo no válido."}), 400
    
    if not filename.lower().endswith('.json'):
        filename += '.json'

    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(project_data, f, indent=4, ensure_ascii=False)
        return jsonify({
            "message": f"Proyecto guardado como '{filename}'.",
            "path": os.path.abspath(filename)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)