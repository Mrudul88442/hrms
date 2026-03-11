def calculate_final_score(ai_analysis):
    """
    Calculates final score and generates hiring recommendation based on Gemini's sub-scores.
    
    Weights configuration:
    - Skills match: 50%
    - Experience: 35%
    - Education: 15%
    """
    
    # If there's an error from the AI step, just return it
    if "error" in ai_analysis:
        return ai_analysis
        
    try:
        evaluation = ai_analysis.get('evaluation', {})
        candidate = ai_analysis.get('candidate', {})
        
        # Extract sub-scores
        skills_score = float(evaluation.get('skills_match_score', 0))
        experience_score = float(evaluation.get('experience_score', 0))
        education_score = float(evaluation.get('education_score', 0))
        
        # Calculate weighted final score (Max 100)
        final_score = (skills_score * 0.50) + (experience_score * 0.35) + (education_score * 0.15)
        # Round to 1 decimal place
        final_score = round(final_score, 1)
        
        # Determine recommendation
        if final_score >= 85:
            recommendation = "Strong Hire"
        elif final_score >= 70:
            recommendation = "Consider"
        elif final_score >= 50:
            recommendation = "Borderline"
        else:
            recommendation = "Reject"
            
        # Reformat into a flat, predictable structure for the frontend
        return {
            "name": candidate.get("name", "Unknown"),
            "email": candidate.get("email", "Not Provided"),
            "skills": ", ".join(candidate.get("skills", [])),
            "education": " | ".join(candidate.get("education", [])),
            "experience": " | ".join(candidate.get("experience", [])),
            "skills_score": skills_score,
            "experience_score": experience_score,
            "education_score": education_score,
            "final_score": final_score,
            "recommendation": recommendation,
            "summary": evaluation.get("summary", "No summary provided.")
        }
        
    except Exception as e:
        print(f"Error calculating score: {e}")
        return {
            "error": "Failed to calculate score based on AI output."
        }
