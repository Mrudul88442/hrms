import os
import sqlite3
import uuid
from flask import Flask, request, jsonify, render_template, send_file, session, redirect, url_for, flash
from flask_cors import CORS
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
from functools import wraps
import tempfile
import json
import traceback
import pandas as pd
import io
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

# Import our services
from services.parser_service import extract_text_from_file
from services.gemini_service import analyze_resume_with_gemini
from services.scoring_service import calculate_final_score

# Load environment variables
load_dotenv(override=True)

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

# SendGrid Configuration
SENDGRID_API_KEY = os.environ.get('SENDGRID_API_KEY')
SENDGRID_VERIFIED_SENDER = os.environ.get('SENDGRID_VERIFIED_SENDER', 'your-email@domain.com')

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max limit
app.secret_key = os.environ.get('SECRET_KEY', 'hrms-super-secret-key-2026')
ALLOWED_EXTENSIONS = {'pdf', 'docx'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def init_db():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    
    # Users Table
    c.execute('''CREATE TABLE IF NOT EXISTS users 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  username TEXT NOT NULL,
                  email TEXT UNIQUE NOT NULL, 
                  password_hash TEXT NOT NULL,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
                  
    # Jobs Table
    c.execute('''CREATE TABLE IF NOT EXISTS jobs 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  user_id INTEGER,
                  title TEXT, description TEXT, 
                  public_token TEXT,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (user_id) REFERENCES users(id))''')
                  
    # Ensure existing jobs table has user_id
    try:
        c.execute("ALTER TABLE jobs ADD COLUMN user_id INTEGER REFERENCES users(id)")
    except sqlite3.OperationalError:
        pass # Column already exists
        
    try:
        c.execute("ALTER TABLE jobs ADD COLUMN public_token TEXT")
    except sqlite3.OperationalError:
        pass
                  
    # Candidates Table (with job_id)
    c.execute('''CREATE TABLE IF NOT EXISTS candidates 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  job_id INTEGER,
                  name TEXT, email TEXT, skills TEXT, 
                  education TEXT, experience TEXT, 
                  skills_score REAL, experience_score REAL, 
                  education_score REAL, final_score REAL, 
                  recommendation TEXT, summary TEXT,
                  resume_path TEXT,
                  FOREIGN KEY (job_id) REFERENCES jobs(id))''')
                  
    try:
        c.execute("ALTER TABLE candidates ADD COLUMN resume_path TEXT")
    except sqlite3.OperationalError:
        pass
                  
    # Email History Table
    c.execute('''CREATE TABLE IF NOT EXISTS email_history 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  candidate_id INTEGER,
                  sender_id INTEGER,
                  subject TEXT,
                  body TEXT,
                  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (candidate_id) REFERENCES candidates(id),
                  FOREIGN KEY (sender_id) REFERENCES users(id))''')
                  
    # User Settings Table
    c.execute('''CREATE TABLE IF NOT EXISTS user_settings 
                 (user_id INTEGER PRIMARY KEY, 
                  email_enabled BOOLEAN DEFAULT 1,
                  email_provider TEXT DEFAULT 'native',
                  sender_email TEXT,
                  FOREIGN KEY (user_id) REFERENCES users(id))''')

    # Migration for new column
    try:
        c.execute("ALTER TABLE user_settings ADD COLUMN sender_email TEXT")
    except sqlite3.OperationalError:
        pass # Column already exists
                  
    conn.commit()
    conn.close()

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            # For JSON API requests
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Authentication required'}), 401
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

# --- Authentication Routes ---

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
        
    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        
        if not username or not email or not password:
            flash('All fields are required', 'error')
            return render_template('signup.html')
            
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # Check if user exists
        c.execute('SELECT * FROM users WHERE email = ?', (email,))
        if c.fetchone():
            flash('Email address already registered', 'error')
            conn.close()
            return render_template('signup.html')
            
        # Create user
        hashed_pw = generate_password_hash(password, method='pbkdf2:sha256')
        c.execute('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', 
                  (username, email, hashed_pw))
        conn.commit()
        
        # Log user in
        user_id = c.lastrowid
        session['user_id'] = user_id
        session['username'] = username
        session['email'] = email
        
        # Create default user settings
        c.execute('INSERT INTO user_settings (user_id, email_enabled, email_provider) VALUES (?, 1, "native")', (user_id,))
        conn.commit()
        conn.close()
        
        return redirect(url_for('dashboard'))
        
    return render_template('signup.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
        
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')
        
        conn = sqlite3.connect('database.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM users WHERE email = ?', (email,))
        user = c.fetchone()
        conn.close()
        
        if user and check_password_hash(user['password_hash'], password):
            session['user_id'] = user['id']
            session['username'] = user['username']
            session['email'] = user['email']
            return redirect(url_for('dashboard'))
        else:
            flash('Please check your login details and try again.', 'error')
            
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('welcome'))

# --- Application Routes ---

@app.route('/')
def welcome():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return render_template('landing.html')

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')

@app.route('/analyze')
@login_required
def index():
    return render_template('index.html')

@app.route('/candidates')
@login_required
def candidates_page():
    return render_template('candidates.html')

@app.route('/jobs')
@login_required
def jobs_page():
    return render_template('jobs.html')

@app.route('/apply/<token>', methods=['GET'])
def apply_page(token):
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('SELECT title, description FROM jobs WHERE public_token = ?', (token,))
    job = c.fetchone()
    conn.close()
    
    if not job:
        return "Job not found or link is invalid.", 404
        
    return render_template('apply.html', job=job, token=token)

# --- API Endpoints ---

@app.route('/api/public/apply/<token>', methods=['POST'])
def public_apply(token):
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        c.execute('SELECT id, description FROM jobs WHERE public_token = ?', (token,))
        job_row = c.fetchone()
        conn.close()

        if not job_row:
            return jsonify({"error": "Invalid application link"}), 404

        job_id, job_description = job_row
        
        name = request.form.get('name')
        email = request.form.get('email')
        
        if not name or not email:
            return jsonify({"error": "Name and email are required"}), 400

        if 'resume' not in request.files:
            return jsonify({"error": "Resume file is required"}), 400
            
        file = request.files['resume']
        if file.filename == '' or not allowed_file(file.filename):
            return jsonify({"error": "Invalid file. Only PDF and DOCX are allowed."}), 400

        # Save file securely
        filename = secure_filename(file.filename)
        safe_name = f"{uuid.uuid4().hex}_{filename}"
        upload_path = os.path.join('uploads', safe_name)
        file.save(upload_path)

        # Process with Gemini synchronously
        try:
            resume_text, ext = extract_text_from_file(upload_path, safe_name)
            if not resume_text:
                return jsonify({"error": "Could not extract text from document."}), 400

            ai_analysis = analyze_resume_with_gemini(resume_text, job_description)
            if "error" in ai_analysis:
                return jsonify({"error": ai_analysis["error"]}), 400
                
            scored_result = calculate_final_score(ai_analysis)

            conn = sqlite3.connect('database.db')
            c = conn.cursor()
            c.execute('''INSERT INTO candidates 
                         (job_id, name, email, skills, education, experience, 
                          skills_score, experience_score, education_score, 
                          final_score, recommendation, summary, resume_path) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                      (job_id,
                       name, email,
                       scored_result.get('skills', ''),
                       scored_result.get('education', ''),
                       scored_result.get('experience', ''),
                       scored_result.get('skills_score', 0),
                       scored_result.get('experience_score', 0),
                       scored_result.get('education_score', 0),
                       scored_result.get('final_score', 0),
                       scored_result.get('recommendation', ''),
                       scored_result.get('summary', ''),
                       upload_path))
            conn.commit()
            conn.close()

            return jsonify({"success": True, "message": "Application submitted successfully! Our HR team will review your profile shortly."})
            
        except Exception as e:
            print(f"Error processing upload: {str(e)}")
            return jsonify({"error": "Failed to process resume."}), 500

    except Exception as e:
        print(traceback.format_exc())
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/stats', methods=['GET'])
@login_required
def get_stats():
    try:
        user_id = session['user_id']
        job_id = request.args.get('job_id')
        conn = sqlite3.connect('database.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        # Base query logic
        join_clause = "JOIN jobs ON candidates.job_id = jobs.id"
        where_clause = "WHERE jobs.user_id = ?"
        params = [user_id]
        
        if job_id and job_id != 'all':
            where_clause += " AND candidates.job_id = ?"
            params.append(job_id)
        
        # Total Candidates
        c.execute(f'SELECT COUNT(candidates.id) as count FROM candidates {join_clause} {where_clause}', params)
        total_candidates = c.fetchone()['count']
        
        # Average Score
        c.execute(f'SELECT AVG(candidates.final_score) as avg_score FROM candidates {join_clause} {where_clause}', params)
        avg_score = round(c.fetchone()['avg_score'] or 0, 1)
        
        # Recommendation Distribution
        c.execute(f'SELECT candidates.recommendation, COUNT(*) as count FROM candidates {join_clause} {where_clause} GROUP BY candidates.recommendation', params)
        distribution = {row['recommendation']: row['count'] for row in c.fetchall()}
        
        # Recent Candidates
        c.execute(f'SELECT candidates.name, candidates.final_score, candidates.recommendation FROM candidates {join_clause} {where_clause} ORDER BY candidates.id DESC LIMIT 5', params)
        recent = [dict(row) for row in c.fetchall()]
        
        conn.close()
        return jsonify({
            "success": True,
            "stats": {
                "total": total_candidates,
                "avg_score": avg_score,
                "distribution": distribution,
                "recent": recent
            }
        })
    except Exception as e:
        print(f"Error fetching stats: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/analyze', methods=['POST'])
@login_required
def analyze_resumes():
    try:
        user_id = session['user_id']
        # Check if API key is configured
        if not os.environ.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY") == "your_gemini_api_key_here":
            return jsonify({
                "error": "Gemini API key is not configured. Please add it to the .env file."
            }), 400

        job_id = request.form.get('job_id')
        job_description = request.form.get('job_description', '')
        
        # Verify job ownership or ensure valid request
        if job_id and job_id != 'new':
            conn = sqlite3.connect('database.db')
            c = conn.cursor()
            c.execute('SELECT description, user_id FROM jobs WHERE id = ?', (job_id,))
            job_row = c.fetchone()
            conn.close()
            
            if not job_row:
                return jsonify({"error": "Job not found"}), 404
            if job_row[1] != user_id:
                return jsonify({"error": "Unauthorized to parse candidates for this job."}), 403
            job_description = job_row[0]

        if not job_description.strip():
            return jsonify({"error": "Job description is required."}), 400

        # Check if files were uploaded
        if 'resumes' not in request.files:
            return jsonify({"error": "No resumes part in the request"}), 400
            
        files = request.files.getlist('resumes')
        
        if not files or files[0].filename == '':
            return jsonify({"error": "No selected files"}), 400

        results = []
        
        def process_single_file(file_data, filename, job_id, job_description):
            safe_name = f"{uuid.uuid4().hex}_{filename}"
            upload_path = os.path.join('uploads', safe_name)
            
            with open(upload_path, 'wb') as f:
                f.write(file_data)
            
            try:
                resume_text, ext = extract_text_from_file(upload_path, filename)
                if not resume_text:
                    return {"filename": filename, "error": "Could not extract text from this file."}

                ai_analysis = analyze_resume_with_gemini(resume_text, job_description)
                if "error" in ai_analysis:
                    return {"filename": filename, "error": ai_analysis["error"]}
                    
                scored_result = calculate_final_score(ai_analysis)
                result = {"filename": filename, **scored_result}
                
                try:
                    conn = sqlite3.connect('database.db')
                    c = conn.cursor()
                    c.execute('''INSERT INTO candidates 
                                 (job_id, name, email, skills, education, experience, 
                                  skills_score, experience_score, education_score, 
                                  final_score, recommendation, summary, resume_path) 
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                              (job_id if job_id and job_id != 'new' else None,
                               scored_result.get('name', 'Unknown'),
                               scored_result.get('email', 'Not Provided'),
                               scored_result.get('skills', ''),
                               scored_result.get('education', ''),
                               scored_result.get('experience', ''),
                               scored_result.get('skills_score', 0),
                               scored_result.get('experience_score', 0),
                               scored_result.get('education_score', 0),
                               scored_result.get('final_score', 0),
                               scored_result.get('recommendation', ''),
                               scored_result.get('summary', ''),
                               upload_path))
                    result['id'] = c.lastrowid
                    conn.commit()
                    conn.close()
                except Exception as db_e:
                    print(f"Database insertion error: {db_e}")

                return result
                
            except Exception as e:
                print(traceback.format_exc())
                return {"filename": filename, "error": f"Error processing file: {str(e)}"}

        file_args = []
        for file in files:
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                file_data = file.read()
                file_args.append((file_data, filename, job_id, job_description))
            else:
                results.append({"filename": file.filename if file else "unknown", "error": "File type not allowed."})

        with ThreadPoolExecutor(max_workers=5) as executor:
            future_results = list(executor.map(lambda args: process_single_file(*args), file_args))
            results.extend([r for r in future_results if r is not None])

        valid_results = [r for r in results if r and "error" not in r]
        error_results = [r for r in results if r and "error" in r]
        
        valid_results.sort(key=lambda x: x.get('final_score', 0), reverse=True)
        
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
@login_required
def get_candidates():
    try:
        user_id = session['user_id']
        job_id = request.args.get('job_id')
        conn = sqlite3.connect('database.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        query = '''
            SELECT candidates.* FROM candidates 
            JOIN jobs ON candidates.job_id = jobs.id 
            WHERE jobs.user_id = ?
        '''
        params = [user_id]
        
        if job_id and job_id != 'all':
            query += ' AND candidates.job_id = ?'
            params.append(job_id)
            
        query += ' ORDER BY candidates.final_score DESC'
        
        c.execute(query, params)
        rows = c.fetchall()
        
        candidates = []
        for r in rows:
            candidates.append({
                "id": r["id"],
                "job_id": r["job_id"],
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
                "summary": r["summary"],
                "has_resume": bool(r["resume_path"])
            })
        conn.close()
        return jsonify({"success": True, "candidates": candidates})
    except Exception as e:
        print(f"Error fetching candidates: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/jobs', methods=['GET', 'POST'])
@login_required
def manage_jobs():
    try:
        user_id = session['user_id']
        conn = sqlite3.connect('database.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        if request.method == 'POST':
            data = request.json
            title = data.get('title')
            description = data.get('description')
            public_token = uuid.uuid4().hex
            
            if not title or not description:
                return jsonify({"error": "Title and description are required"}), 400
                
            c.execute('INSERT INTO jobs (user_id, title, description, public_token) VALUES (?, ?, ?, ?)', 
                      (user_id, title, description, public_token))
            job_id = c.lastrowid
            conn.commit()
            conn.close()
            return jsonify({"success": True, "id": job_id, "public_token": public_token})
            
        else: # GET
            query = '''
                SELECT jobs.id, jobs.title, jobs.description, jobs.created_at, jobs.public_token, COUNT(candidates.id) as candidate_count 
                FROM jobs LEFT JOIN candidates ON jobs.id = candidates.job_id 
                WHERE jobs.user_id = ? 
                GROUP BY jobs.id 
                ORDER BY jobs.created_at DESC
            '''
            c.execute(query, (user_id,))
            
            jobs = []
            for row in c.fetchall():
                jobs.append({
                    "id": row["id"],
                    "title": row["title"],
                    "description": row["description"],
                    "created_at": row["created_at"],
                    "public_token": row["public_token"] or '',
                    "candidate_count": row["candidate_count"]
                })
            conn.close()
            return jsonify({"success": True, "jobs": jobs})
            
    except Exception as e:
        print(f"Manage Jobs Error: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/search', methods=['GET'])
@login_required
def global_search():
    try:
        user_id = session['user_id']
        query = request.args.get('q', '').strip()
        
        if not query:
            return jsonify({"success": True, "results": {"candidates": [], "jobs": []}})
            
        conn = sqlite3.connect('database.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        # Search Candidates
        c.execute('''
            SELECT c.id, c.name, c.email, c.recommendation, c.final_score, j.title as job_title
            FROM candidates c
            JOIN jobs j ON c.job_id = j.id
            WHERE j.user_id = ? AND (c.name LIKE ? OR c.email LIKE ? OR c.skills LIKE ?)
            LIMIT 5
        ''', (user_id, f'%{query}%', f'%{query}%', f'%{query}%'))
        candidates = [dict(row) for row in c.fetchall()]
        
        # Search Jobs
        c.execute('''
            SELECT id, title, description, created_at
            FROM jobs
            WHERE user_id = ? AND (title LIKE ? OR description LIKE ?)
            LIMIT 5
        ''', (user_id, f'%{query}%', f'%{query}%'))
        jobs = [dict(row) for row in c.fetchall()]
        
        conn.close()
        return jsonify({
            "success": True,
            "results": {
                "candidates": candidates,
                "jobs": jobs
            }
        })
    except Exception as e:
        print(f"Search Error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/send_email', methods=['POST'])
@login_required
def send_candidate_email():
    try:
        data = request.json
        candidate_id = data.get('candidate_id')
        subject = data.get('subject')
        message_body = data.get('body')
        user_id = session['user_id']
        
        if not candidate_id or not subject or not message_body:
            return jsonify({"success": False, "error": "All fields are required"}), 400
            
        conn = sqlite3.connect('database.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        # Verify candidate exists and belongs to this user (through job)
        c.execute('''SELECT c.email as candidate_email, c.name as candidate_name, u.email as hr_email FROM candidates c 
                     JOIN jobs j ON c.job_id = j.id 
                     JOIN users u ON j.user_id = u.id
                     WHERE c.id = ? AND j.user_id = ?''', (candidate_id, user_id))
        row = c.fetchone()
        
        if not row:
            conn.close()
            return jsonify({"success": False, "error": "Candidate or HR account not found"}), 404
            
        # Record Email interaction in history
        try:
            c.execute('''INSERT INTO email_history (candidate_id, sender_id, subject, body) 
                         VALUES (?, ?, ?, ?)''', (candidate_id, user_id, subject, message_body))
            conn.commit()
            conn.close()
            
            return jsonify({
                "success": True, 
                "message": f"Email action logged for {row['candidate_name']}."
            })
            
        except Exception as db_err:
            print(f"Database logging error: {str(db_err)}")
            conn.close()
            return jsonify({"success": False, "error": "Failed to log email history."}), 500
            
    except Exception as e:
        print(f"Log email error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/download_resume/<int:candidate_id>')
@login_required
def download_resume(candidate_id):
    user_id = session['user_id']
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        c.execute('''SELECT c.resume_path, c.name FROM candidates c 
                     JOIN jobs j ON c.job_id = j.id 
                     WHERE c.id = ? AND j.user_id = ?''', (candidate_id, user_id))
        row = c.fetchone()
        conn.close()

        if not row or not row[0]:
            return "Resume not found in records.", 404

        path = row[0]
        if not os.path.exists(path):
            return "Resume file is missing from server storage.", 404

        ext = path.rsplit('.', 1)[1].lower() if '.' in path else 'pdf'
        safe_name = f"{str(row[1]).replace(' ', '_')}_Resume.{ext}"
        return send_file(path, as_attachment=True, download_name=safe_name)

    except Exception as e:
        print(f"Download error: {e}")
        return "Internal server error during download.", 500

@app.route('/api/export', methods=['GET'])
@login_required
def export_results():
    try:
        user_id = session['user_id']
        job_id = request.args.get('job_id')
        conn = sqlite3.connect('database.db')
        
        query = '''
            SELECT candidates.name, candidates.email, candidates.final_score, 
                   candidates.recommendation, candidates.skills, candidates.experience, 
                   candidates.education, candidates.summary 
            FROM candidates 
            JOIN jobs ON candidates.job_id = jobs.id 
            WHERE jobs.user_id = ?
        '''
        params = [user_id]
        
        if job_id and job_id != 'all':
            query += ' AND candidates.job_id = ?'
            params.append(job_id)
            
        df = pd.read_sql_query(query, conn, params=params)
        conn.close()
        
        if df.empty:
            return jsonify({"error": "No data to export"}), 400
            
        df.columns = ['Name', 'Email', 'Score', 'Recommendation', 'Skills', 'Experience', 'Education', 'AI Summary']
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Candidates')
            
        output.seek(0)
        
        filename = f"candidates_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        print(f"Export error: {e}")
        return jsonify({"error": str(e)}), 500
@app.route('/settings')
@login_required
def settings():
    return render_template('settings.html')

@app.route('/api/settings', methods=['GET', 'POST'])
@login_required
def api_settings():
    user_id = session['user_id']
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    if request.method == 'GET':
        c.execute('SELECT email_enabled, email_provider, sender_email FROM user_settings WHERE user_id = ?', (user_id,))
        row = c.fetchone()
        
        # If settings don't exist for some reason, create default
        if not row:
            c.execute('INSERT INTO user_settings (user_id, email_enabled, email_provider) VALUES (?, 1, "native")', (user_id,))
            conn.commit()
            email_enabled = 1
            email_provider = 'native'
            sender_email = None
        else:
            email_enabled = row['email_enabled']
            email_provider = row['email_provider']
            sender_email = row['sender_email']
            
        conn.close()
        return jsonify({
            "email_enabled": bool(email_enabled),
            "email_provider": email_provider,
            "sender_email": sender_email
        })

    if request.method == 'POST':
        data = request.json
        email_enabled = 1 if data.get('email_enabled') else 0
        email_provider = data.get('email_provider', 'native')
        sender_email = data.get('sender_email', '').strip() or None

        c.execute('''UPDATE user_settings 
                     SET email_enabled = ?, email_provider = ?, sender_email = ? 
                     WHERE user_id = ?''', (email_enabled, email_provider, sender_email, user_id))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Settings updated successfully!"})

if __name__ == '__main__':
    # Ensure static and templates directories exist
    os.makedirs('static/css', exist_ok=True)
    os.makedirs('static/js', exist_ok=True)
    os.makedirs('static/images', exist_ok=True)
    os.makedirs('templates', exist_ok=True)
    os.makedirs('services', exist_ok=True)
    os.makedirs('uploads', exist_ok=True)
    
    init_db()
    app.run(debug=True, port=5000)
