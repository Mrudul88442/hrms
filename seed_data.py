import sqlite3
import random
from datetime import datetime, timedelta

def seed_db():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    
    # Clear existing data for a clean demo
    # c.execute('DELETE FROM candidates')
    # c.execute('DELETE FROM jobs')
    
    # 1. Create Sample Jobs
    jobs = [
        ("Senior Python Developer", "We are looking for a Senior Python Developer with experience in Flask, FastAPI, and AI integration. Knowledge of PostgreSQL and AWS is a plus."),
        ("Frontend Engineer (React)", "Looking for a creative Frontend Engineer specialized in React, TailwindCSS, and Framer Motion. Must have a strong eye for UI/UX design."),
        ("Product Manager", "Experienced Product Manager to lead our AI-driven HRMS expansion. Strong communication and agile methodology skills required."),
        ("Data Scientist", "Join our team to build next-gen scoring models. Proficiency in Python, TensorFlow, and large language models (LLMs) is essential.")
    ]
    
    job_ids = []
    for title, desc in jobs:
        c.execute('INSERT INTO jobs (title, description) VALUES (?, ?)', (title, desc))
        job_ids.append(c.lastrowid)
    
    # 2. Create Sample Candidates
    recommendations = ["Strong Hire", "Consider", "Borderline", "Reject"]
    names = [
        "Arjun Sharma", "Priya Patel", "Rohan Mehta", "Sanya Iyer", 
        "Kevin Miller", "Sarah Chen", "David Wilson", "Elena Rodriguez",
        "Michael Scott", "Pam Beesly", "Jim Halpert", "Dwight Schrute"
    ]
    
    for i in range(25):
        name = random.choice(names) + f" {random.randint(1,100)}"
        email = f"{name.lower().replace(' ', '.')}@example.com"
        job_id = random.choice(job_ids)
        
        # Random scores
        skills_score = random.randint(40, 100)
        exp_score = random.randint(30, 95)
        edu_score = random.randint(50, 90)
        
        final_score = round((skills_score * 0.5) + (exp_score * 0.35) + (edu_score * 0.15), 1)
        
        if final_score >= 85: rec = "Strong Hire"
        elif final_score >= 70: rec = "Consider"
        elif final_score >= 50: rec = "Borderline"
        else: rec = "Reject"
        
        c.execute('''INSERT INTO candidates 
                     (job_id, name, email, skills, education, experience, 
                      skills_score, experience_score, education_score, 
                      final_score, recommendation, summary) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                  (job_id, name, email, 
                   "Python, Flask, SQL, Docker, AWS", 
                   "B.Tech in Computer Science", 
                   "5 Years at Tech Corp, 2 Years at Startup Inc",
                   skills_score, exp_score, edu_score,
                   final_score, rec, f"This candidate shows strong potential in {random.choice(['backend development', 'system design', 'team leadership'])}."))
    
    conn.commit()
    conn.close()
    print("Database seeded successfully with 4 jobs and 25 candidates!")

if __name__ == "__main__":
    seed_db()
