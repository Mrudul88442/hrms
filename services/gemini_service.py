import os
import json
import google.generativeai as genai

def setup_gemini():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        raise ValueError("Gemini API key is not configured.")
    genai.configure(api_key=api_key)

def analyze_resume_with_gemini(resume_text, job_description):
    """
    Calls Google Gemini API to analyze the resume text against the job description.
    Expected output is a structured JSON.
    """
    try:
        setup_gemini()
        
        # Try to use generation_config to force JSON response
        model = genai.GenerativeModel("gemini-2.5-flash", 
                                      generation_config={"response_mime_type": "application/json"})
        
        prompt = f'''
You are an expert HR Associate and AI resume evaluator. 
Your task is to analyze the provided Candidate Resume and evaluate it against the given Job Description.
Extract the following candidate details and provide an evaluation. 
Wait, you must output your response STRICTLY as valid JSON without any markdown formatting wrappers (like ```json ... ```) so it can be parsed directly.

Job Description:
{job_description}

Candidate Resume:
{resume_text}

JSON Format Required:
{{
  "candidate": {{
    "name": "Full Name",
    "email": "Email Address",
    "education": ["Degree 1", "Degree 2"],
    "experience": ["Role 1 at Company A", "Role 2 at Company B"],
    "skills": ["Skill 1", "Skill 2", "Skill 3"]
  }},
  "evaluation": {{
    "skills_match_score": 85,
    "experience_score": 70,
    "education_score": 90,
    "summary": "A 2-3 sentence summary of why this candidate is or isn't a fit."
  }}
}}

Ensure scores are numeric values, not string variables. Output ONLY the JSON object.
'''

        response = model.generate_content(prompt)
        text = response.text.strip()
        
        # Use regex to find the JSON block in case there's any surrounding text
        import re
        json_match = re.search(r'(\{[\s\S]*\})', text)
        if json_match:
            text = json_match.group(1)
            
        result = json.loads(text)
        return result
        
    except Exception as e:
        print(f"Gemini Analysis Error: {e}")
        return {"error": str(e)}
