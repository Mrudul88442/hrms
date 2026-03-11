document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const fileList = document.getElementById('fileList');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const jobDescription = document.getElementById('jobDescription');
    const errorMessage = document.getElementById('errorMessage');
    const loaderOverlay = document.getElementById('loaderOverlay');
    const resultsTableBody = document.getElementById('resultsTableBody');
    const exportBtn = document.getElementById('exportBtn');
    
    // Modal Elements
    const candidateModal = document.getElementById('candidateModal');
    const modalOverlay = document.getElementById('modalOverlay');
    const closeModalElements = [document.getElementById('closeModal'), document.getElementById('modalCloseBtn'), modalOverlay];

    // State
    let selectedFiles = [];
    let processingResults = [];

    // Setup Event Listeners
    browseBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    // Drag and drop setup
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('dragover');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const droppedFiles = e.dataTransfer.files;
        handleFiles(droppedFiles);
    });

    function handleFiles(files) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const ext = file.name.split('.').pop().toLowerCase();
            
            if (ext === 'pdf' || ext === 'doc' || ext === 'docx') {
                if (!selectedFiles.some(f => f.name === file.name)) {
                    selectedFiles.push(file);
                }
            } else {
                showError(`File type not supported: ${file.name}`);
            }
        }
        renderFileList();
    }

    function renderFileList() {
        if (selectedFiles.length === 0) {
            fileList.innerHTML = '';
            return;
        }

        fileList.innerHTML = selectedFiles.map((file, index) => `
            <div class="file-item">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-file-pdf" style="color: #ef4444;"></i>
                    <span>${file.name}</span>
                </div>
                <i class="fa-solid fa-xmark remove-file" data-index="${index}"></i>
            </div>
        `).join('');

        // Add remove listeners
        document.querySelectorAll('.remove-file').forEach(icon => {
            icon.addEventListener('click', (e) => {
                const index = e.target.getAttribute('data-index');
                selectedFiles.splice(index, 1);
                renderFileList();
            });
        });
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.classList.remove('hidden');
        setTimeout(() => {
            errorMessage.classList.add('hidden');
        }, 5000);
    }

    // Analyze Action
    analyzeBtn.addEventListener('click', async () => {
        const jdText = jobDescription.value.trim();
        if (!jdText) {
            showError("Please enter a Job Description.");
            return;
        }

        if (selectedFiles.length === 0) {
            showError("Please upload at least one resume.");
            return;
        }

        const formData = new FormData();
        formData.append('job_description', jdText);
        selectedFiles.forEach(file => {
            formData.append('resumes', file);
        });

        loaderOverlay.classList.remove('hidden');
        errorMessage.classList.add('hidden');

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to analyze resumes.");
            }

            processingResults = data.results;
            renderResults();
            
            if (processingResults.length > 0) {
                exportBtn.disabled = false;
            }

        } catch (error) {
            showError(error.message);
        } finally {
            loaderOverlay.classList.add('hidden');
        }
    });

    // Render Table
    function renderResults() {
        if (processingResults.length === 0) {
            resultsTableBody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="6">
                        <div class="empty-content">
                            <i class="fa-regular fa-folder-open"></i>
                            <p>No valid candidates were analyzed.</p>
                        </div>
                    </td>
                </tr>`;
            return;
        }

        resultsTableBody.innerHTML = processingResults.map((result, index) => {
            if (result.error) {
                return `
                    <tr>
                        <td>-</td>
                        <td>
                            <span class="candidate-name">${result.filename}</span>
                            <span class="candidate-email" style="color:var(--danger)">Parse Error</span>
                        </td>
                        <td colspan="3" style="color:var(--danger); font-size: 0.875rem;">${result.error}</td>
                        <td></td>
                    </tr>
                `;
            }

            // Recommendation Badge Map
            let recClass = '';
            if (result.recommendation === "Strong Hire") recClass = 'strong';
            else if (result.recommendation === "Consider") recClass = 'consider';
            else if (result.recommendation === "Borderline") recClass = 'borderline';
            else recClass = 'reject';

            return `
                <tr>
                    <td><div class="rank-badge">${result.rank}</div></td>
                    <td>
                        <span class="candidate-name">${result.name}</span>
                        <span class="candidate-email">${result.email}</span>
                    </td>
                    <td>${result.skills_score}%</td>
                    <td><strong>${result.final_score}</strong>/100</td>
                    <td><span class="rec-badge ${recClass}">${result.recommendation}</span></td>
                    <td>
                        <button class="btn btn-outline btn-sm view-details" data-index="${index}">
                            View Details
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach listeners to view buttons
        document.querySelectorAll('.view-details').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = e.target.closest('button').getAttribute('data-index');
                openModal(processingResults[index]);
            });
        });
    }

    // Modal logic
    function openModal(data) {
        if (data.error) return;

        document.getElementById('mName').textContent = data.name;
        document.getElementById('mEmail').textContent = data.email;
        document.getElementById('mFinalScore').textContent = data.final_score;
        document.getElementById('mRecommendation').textContent = data.recommendation;
        
        let recClass = '';
        if (data.recommendation === "Strong Hire") recClass = 'strong';
        else if (data.recommendation === "Consider") recClass = 'consider';
        else if (data.recommendation === "Borderline") recClass = 'borderline';
        else recClass = 'reject';
        
        const recBadge = document.getElementById('mRecommendation');
        recBadge.className = `m-badge rec-badge ${recClass}`;

        document.getElementById('mSummary').textContent = data.summary;
        
        // Progress bars
        document.getElementById('mSkillsScore').textContent = data.skills_score;
        document.getElementById('mExpScore').textContent = data.experience_score;
        document.getElementById('mEduScore').textContent = data.education_score;

        // Animations for progress bars
        setTimeout(() => {
            document.getElementById('mSkillsFill').style.width = `${data.skills_score}%`;
            document.getElementById('mExpFill').style.width = `${data.experience_score}%`;
            document.getElementById('mEduFill').style.width = `${data.education_score}%`;
        }, 100);

        // Details
        let skillsHtml = "";
        if (data.skills) {
            const skillsArray = data.skills.split(',').map(s => s.trim());
            skillsHtml = skillsArray.map(s => `<span class="skill-tag">${s}</span>`).join('');
        }
        document.getElementById('mSkillsList').innerHTML = skillsHtml || "None found";
        
        document.getElementById('mExperience').textContent = data.experience || "Not listed";
        document.getElementById('mEducation').textContent = data.education || "Not listed";

        candidateModal.classList.remove('hidden');
    }

    closeModalElements.forEach(el => {
        if(el) {
            el.addEventListener('click', () => {
                candidateModal.classList.add('hidden');
                // Reset bars
                document.getElementById('mSkillsFill').style.width = `0%`;
                document.getElementById('mExpFill').style.width = `0%`;
                document.getElementById('mEduFill').style.width = `0%`;
            });
        }
    });

    // CSV Export
    exportBtn.addEventListener('click', () => {
        if (processingResults.length === 0) return;

        const headers = ["Rank", "Name", "Email", "Final Score", "Skills Score", "Experience Score", "Education Score", "Recommendation"];
        const validResults = processingResults.filter(r => !r.error);
        
        const rows = validResults.map(r => [
            r.rank,
            `"${r.name}"`,
            `"${r.email}"`,
            r.final_score,
            r.skills_score,
            r.experience_score,
            r.education_score,
            `"${r.recommendation}"`
        ]);

        let csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "HR_AI_Resume_Scores.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
});
