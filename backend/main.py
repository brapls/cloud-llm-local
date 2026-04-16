from flask import Flask, request, jsonify
import ollama

app = Flask(__name__)

@app.route('/prompt', methods=['POST'])
def prompt_model():
    print("Received request at /prompt endpoint")
    # Get data from the POST request
    data = request.get_json()
    
    if not data or 'prompt' not in data:
        return jsonify({"error": "Missing 'prompt' in request body"}), 400
    
    user_prompt = data.get('prompt')
    print(f"User prompt: {user_prompt}")
    model_name = data.get('model', 'phi3:mini-4k') # Default to llama3.2
    
    try:
        # Call Ollama
        response = ollama.generate(model=model_name, prompt=user_prompt)
        
        return jsonify({
            "status": "success",
            "model": model_name,
            "response": response['response']
        })
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    # Running on port 5000 by default
    app.run(host='0.0.0.0', port=5000, debug=True)