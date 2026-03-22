import os
import sqlite3
from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
import tempfile
import json
import traceback

# Import our services
from services.parser_service import extract_text_from_file
from services.gemini_service import analyze_resume_with_gemini
from services.scoring_service import calculate_final_score

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max limit
ALLOWED_EXTENSIONS = {'pdf', 'docx'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def init_db():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS candidates 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  name TEXT, email TEXT, skills TEXT, 
                  education TEXT, experience TEXT, 
                  skills_score REAL, experience_score REAL, 
                  education_score REAL, final_score REAL, 
                  recommendation TEXT, summary TEXT)''')
    conn.commit()
    conn.close()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/candidates')
def candidates_page():
    return render_template('candidates.html')

@app.route('/api/analyze', methods=['POST'])
def analyze_resumes():
    try:
        # Check if API key is configured
        if not os.environ.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY") == "your_gemini_api_key_here":
            return jsonify({
                "error": "Gemini API key is not configured. Please add it to the .env file."
            }), 400

        job_description = request.form.get('job_description', '')
        if not job_description.strip():
            return jsonify({"error": "Job description is required."}), 400

        # Check if files were uploaded
        if 'resumes' not in request.files:
            return jsonify({"error": "No resumes part in the request"}), 400
            
        files = request.files.getlist('resumes')
        
        if not files or files[0].filename == '':
            return jsonify({"error": "No selected files"}), 400

        results = []
        
        # Process each file
        for file in files:
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                
                # Save to a temporary file for parsing
                temp_dir = tempfile.gettempdir()
                temp_path = os.path.join(temp_dir, filename)
                file.save(temp_path)
                
                try:
                    # 1. Extract text from document
                    resume_text, ext = extract_text_from_file(temp_path, filename)
                    
                    if not resume_text:
                        results.append({
                            "filename": filename,
                            "error": "Could not extract text from this file."
                        })
                        continue

                    # 2. Analyze with Gemini
                    ai_analysis = analyze_resume_with_gemini(resume_text, job_description)
                    
                    if "error" in ai_analysis:
                        results.append({
                            "filename": filename,
                            "error": ai_analysis["error"]
                        })
                        continue
                        
                    # 3. Calculate final scoring
                    scored_result = calculate_final_score(ai_analysis)
                    
                    # 4. Format for response
                    result = {
                        "filename": filename,
                        **scored_result
                    }
                    
                    # Save into DB
                    try:
                        conn = sqlite3.connect('database.db')
                        c = conn.cursor()
                        c.execute('''INSERT INTO candidates 
                                     (name, email, skills, education, experience, 
                                      skills_score, experience_score, education_score, 
                                      final_score, recommendation, summary) 
                                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                                  (scored_result.get('name', 'Unknown'),
                                   scored_result.get('email', 'Not Provided'),
                                   scored_result.get('skills', ''),
                                   scored_result.get('education', ''),
                                   scored_result.get('experience', ''),
                                   scored_result.get('skills_score', 0),
                                   scored_result.get('experience_score', 0),
                                   scored_result.get('education_score', 0),
                                   scored_result.get('final_score', 0),
                                   scored_result.get('recommendation', ''),
                                   scored_result.get('summary', '')))
                        result['id'] = c.lastrowid
                        conn.commit()
                        conn.close()
                    except Exception as db_e:
                        print(f"Database insertion error: {db_e}")

                    results.append(result)
                    
                except Exception as e:
                    print(f"Error processing {filename}: {str(e)}")
                    print(traceback.format_exc())
                    results.append({
                        "filename": filename,
                        "error": f"Error processing file: {str(e)}"
                    })
                finally:
                    # Clean up temp file
                    if os.path.exists(temp_path):
                        try:
                            os.remove(temp_path)
                        except:
                            pass
            else:
                results.append({
                    "filename": file.filename if file else "unknown",
                    "error": "File type not allowed. Please upload PDF or DOCX."
                })

        # Sort results by final score descending
        # Filter out errors from sorting
        valid_results = [r for r in results if "error" not in r]
        error_results = [r for r in results if "error" in r]
        
        valid_results.sort(key=lambda x: x.get('final_score', 0), reverse=True)
        
        # Assign rank to valid results
        for idx, res in enumerate(valid_results):
            res['rank'] = idx + 1
            
        final_list = valid_results + error_results
        
        return jsonify({
            "success": True, 
            "results": final_list,
            "total_processed": len(final_list),
            "valid_count": len(valid_results)
        })
        
    except Exception as e:
        print(traceback.format_exc())
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/candidates', methods=['GET'])
def get_candidates():
    try:
        conn = sqlite3.connect('database.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM candidates ORDER BY final_score DESC')
        rows = c.fetchall()
        
        candidates = []
        for r in rows:
            candidates.append({
                "id": r["id"],
                "name": r["name"],
                "email": r["email"],
                "skills": r["skills"],
                "education": r["education"],
                "experience": r["experience"],
                "skills_score": r["skills_score"],
                "experience_score": r["experience_score"],
                "education_score": r["education_score"],
                "final_score": r["final_score"],
                "recommendation": r["recommendation"],
                "summary": r["summary"]
            })
        conn.close()
        return jsonify({"success": True, "candidates": candidates})
    except Exception as e:
        print(f"Error fetching candidates: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/export', methods=['POST'])
def export_results():
    try:
        data = request.json
        if not data or 'results' not in data:
            return jsonify({"error": "No results data provided"}), 400
            
        results = data['results']
        
        # In a real app we'd generate a CSV/Excel file and send it
        # For simplicity in this demo, the frontend will just handle the export via JS
        # using the data it already has, so this endpoint focuses on returning a success confirmation
        
        return jsonify({"success": True})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Ensure static and templates directories exist
    os.makedirs('static/css', exist_ok=True)
    os.makedirs('static/js', exist_ok=True)
    os.makedirs('static/images', exist_ok=True)
    os.makedirs('templates', exist_ok=True)
    os.makedirs('services', exist_ok=True)
    
    init_db()
    app.run(debug=True, port=5000)
