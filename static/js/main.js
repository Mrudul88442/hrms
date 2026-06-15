document.addEventListener('DOMContentLoaded', () => {
    // --- Layout Elements ---
    const sidebar = document.getElementById('sidebar');
    const mainWrapper = document.getElementById('mainWrapper');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;

    // --- Theme Management ---
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        body.classList.add('dark-mode');
        updateThemeIcons('dark');
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = body.classList.toggle('dark-mode');
            const newTheme = isDark ? 'dark' : 'light';
            localStorage.setItem('theme', newTheme);
            updateThemeIcons(newTheme);
            
            // Re-initialize charts to apply new theme colors if on dashboard
            if (document.getElementById('scoreChart')) {
                loadDashboardData(dashboardJobFilter ? dashboardJobFilter.value : 'all');
            }
        });
    }

    function updateThemeIcons(theme) {
        // Update all theme toggle icons across pages
        document.querySelectorAll('#themeToggle i').forEach(icon => {
            icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        });
    }

    // Dashboard Data Elements
    const statTotal = document.getElementById('statTotal');
    const statAvgScore = document.getElementById('statAvgScore');
    const statStrongMatches = document.getElementById('statStrongMatches');
    const recentCandidatesBody = document.getElementById('recentCandidatesBody');

    // Analysis/Candidates Page Elements
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
    const allCandidatesTableBody = document.getElementById('allCandidatesTableBody');
    
    // Job Management Elements
    const jobSelect = document.getElementById('jobSelect');
    const dashboardJobFilter = document.getElementById('dashboardJobFilter');
    const candidatesJobFilter = document.getElementById('candidatesJobFilter');
    const addNewJobBtn = document.getElementById('addNewJobBtn');
    const jobModal = document.getElementById('jobModal');
    const closeJobModal = document.getElementById('closeJobModal');
    const cancelJobBtn = document.getElementById('cancelJobBtn');
    const saveJobBtn = document.getElementById('saveJobBtn');
    const newJobTitle = document.getElementById('newJobTitle');
    const newJobDescription = document.getElementById('newJobDescription');
    const jdContainer = document.getElementById('jdContainer');
    
    // Modal Elements
    const candidateModal = document.getElementById('candidateModal');
    const modalOverlay = document.getElementById('modalOverlay');
    const closeModalElements = [document.getElementById('closeModal'), document.getElementById('modalCloseBtn'), modalOverlay];

    // Email Modal Elements
    const emailModal = document.getElementById('emailModal');
    const emailModalOverlay = document.getElementById('emailModalOverlay');
    const closeEmailModal = document.getElementById('closeEmailModal');
    const cancelEmailBtn = document.getElementById('cancelEmailBtn');
    const confirmSendEmailBtn = document.getElementById('confirmSendEmailBtn');
    const emailCandidateName = document.getElementById('emailCandidateName');
    const emailRecipient = document.getElementById('emailRecipient');
    const emailSubject = document.getElementById('emailSubject');
    const emailBody = document.getElementById('emailBody');
    const emailFeedback = document.getElementById('emailFeedback');
    const emailTemplate = document.getElementById('emailTemplate');

    // Settings Elements
    const emailEnabledToggle = document.getElementById('emailEnabledToggle');
    const emailProviderSelect = document.getElementById('emailProviderSelect');
    const emailProviderSection = document.getElementById('emailProviderSection');
    const senderEmailSection = document.getElementById('senderEmailSection');
    const senderEmailInput = document.getElementById('senderEmailInput');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const settingsFeedback = document.getElementById('settingsFeedback');
    const providerInfoDivs = {
        native: document.getElementById('infoNative'),
        gmail: document.getElementById('infoGmail'),
        outlook: document.getElementById('infoOutlook')
    };

    // Charts
    let scoreChart = null;
    let splitChart = null;

    // State
    let selectedFiles = [];
    let processingResults = [];
    let allCandidatesData = [];
    let userSettings = { email_enabled: true, email_provider: 'native', sender_email: null };

    // --- Layout Interactivity ---
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            if (window.innerWidth > 1024) {
                sidebar.classList.toggle('collapsed');
                mainWrapper.classList.toggle('expanded');
            } else {
                sidebar.classList.toggle('open');
                mobileOverlay.classList.toggle('visible');
            }
        });
    }

    if (mobileOverlay) {
        mobileOverlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            mobileOverlay.classList.remove('visible');
        });
    }

    // Sidebar Link Tooltips on collapse
    const sidebarLinks = document.querySelectorAll('.nav-menu a');

    // --- Initial Data Fetch ---
    async function initSettings() {
        try {
            const response = await fetch('/api/settings');
            const data = await response.json();
            userSettings = data;
            
            // If on settings page, populate UI
            if (emailEnabledToggle) {
                emailEnabledToggle.checked = data.email_enabled;
                emailProviderSelect.value = data.email_provider;
                if (senderEmailInput) senderEmailInput.value = data.sender_email || '';
                toggleEmailProviderSection(data.email_enabled);
                updateProviderInfo(data.email_provider);
            }

            // Sync Table visibility if on Candidates page
            if (allCandidatesTableBody) renderAllCandidates();
        } catch (err) {
            console.error("Error fetching settings:", err);
        }
    }

    initSettings();

    // --- Job Management Logic ---
    async function loadJobs() {
        try {
            const response = await fetch('/api/jobs');
            const data = await response.json();
            if (data.success) {
                const jobs = data.jobs;
                
                // Populate Analyze Page Select
                if (jobSelect) {
                    const currentVal = jobSelect.value;
                    jobSelect.innerHTML = '<option value="new">-- Create New / External --</option>' + 
                        jobs.map(job => `<option value="${job.id}">${job.title}</option>`).join('');
                    jobSelect.value = currentVal;
                }
                
                // Populate Dashboard Filter
                if (dashboardJobFilter) {
                    dashboardJobFilter.innerHTML = '<option value="all">All Job Roles</option>' + 
                        jobs.map(job => `<option value="${job.id}">${job.title}</option>`).join('');
                }

                // Populate Candidates Page Filter
                if (candidatesJobFilter) {
                    candidatesJobFilter.innerHTML = '<option value="all">All Job Roles</option>' + 
                        jobs.map(job => `<option value="${job.id}">${job.title}</option>`).join('');
                }
            }
        } catch (err) { console.error("Error loading jobs:", err); }
    }

    if (jobSelect || dashboardJobFilter || candidatesJobFilter) {
        loadJobs();
    }

    if (jobSelect) {
        jobSelect.addEventListener('change', async (e) => {
            const jobId = e.target.value;
            if (jobId === 'new') {
                jdContainer.style.display = 'block';
                jobDescription.value = '';
                jobDescription.readOnly = false;
            } else {
                // Fetch job description
                try {
                    const response = await fetch('/api/jobs');
                    const data = await response.json();
                    const job = data.jobs.find(j => j.id == jobId);
                    if (job) {
                        jobDescription.value = job.description;
                        jobDescription.readOnly = true;
                        jdContainer.style.display = 'block';
                    }
                } catch (err) { console.error(err); }
            }
        });
    }

    if (addNewJobBtn) {
        addNewJobBtn.addEventListener('click', () => jobModal.classList.remove('hidden'));
    }

    if (closeJobModal) closeJobModal.addEventListener('click', () => jobModal.classList.add('hidden'));
    if (cancelJobBtn) cancelJobBtn.addEventListener('click', () => jobModal.classList.add('hidden'));

    if (saveJobBtn) {
        saveJobBtn.addEventListener('click', async () => {
            const title = newJobTitle.value.trim();
            const description = newJobDescription.value.trim();
            
            if (!title || !description) {
                alert("Please provide both title and description.");
                return;
            }

            try {
                const res = await fetch('/api/jobs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, description })
                });
                const data = await res.json();
                if (data.success) {
                    await loadJobs();
                    jobSelect.value = data.id;
                    jobDescription.value = description;
                    jobDescription.readOnly = true;
                    jobModal.classList.add('hidden');
                    newJobTitle.value = '';
                    newJobDescription.value = '';
                }
            } catch (err) { alert("Failed to create job."); }
        });
    }

    if (dashboardJobFilter) {
        dashboardJobFilter.addEventListener('change', () => {
            loadDashboardData(dashboardJobFilter.value);
        });
    }

    if (candidatesJobFilter) {
        candidatesJobFilter.addEventListener('change', () => {
            loadAllCandidates(candidatesJobFilter.value);
        });
    }

    const candidatesSortFilter = document.getElementById('candidatesSortFilter');
    if (candidatesSortFilter) {
        candidatesSortFilter.addEventListener('change', () => {
            renderAllCandidates();
        });
    }

    // --- Dashboard Specific Logic ---
    if (document.getElementById('scoreChart')) {
        loadDashboardData();
    }

    async function loadDashboardData(jobId = 'all') {
        try {
            const response = await fetch(`/api/stats?job_id=${jobId}`);
            const data = await response.json();
            
            if (data.success) {
                const stats = data.stats;
                
                // Update KPI Cards
                if (statTotal) statTotal.textContent = stats.total;
                if (statAvgScore) statAvgScore.textContent = stats.avg_score + '%';
                
                const strongCount = stats.distribution['Strong Hire'] || 0;
                if (statStrongMatches) statStrongMatches.textContent = strongCount;

                // Render Recent Table
                renderRecentCandidates(stats.recent);

                // Initialize Charts
                initScoreChart(stats.distribution);
                initSplitChart(stats.distribution);
            }
        } catch (err) {
            console.error("Error loading dashboard data:", err);
        }
    }

    function renderRecentCandidates(recent) {
        if (!recentCandidatesBody) return;
        
        if (recent.length === 0) {
            recentCandidatesBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2rem;">No data available</td></tr>`;
            return;
        }

        recentCandidatesBody.innerHTML = recent.map(candidate => {
            let badgeClass = 'badge-info';
            if (candidate.recommendation === 'Strong Hire') badgeClass = 'badge-success';
            else if (candidate.recommendation === 'Reject') badgeClass = 'badge-danger';
            else if (candidate.recommendation === 'Consider') badgeClass = 'badge-warning';

            return `
                <tr>
                    <td>
                        <div class="candidate-cell">
                            <div class="candidate-avatar">${candidate.name.charAt(0)}</div>
                            <div class="candidate-info">
                                <h4>${candidate.name}</h4>
                            </div>
                        </div>
                    </td>
                    <td><span style="font-weight: 600;">${candidate.final_score}</span>/100</td>
                    <td><span class="badge ${badgeClass}">${candidate.recommendation}</span></td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="location.href='/candidates'">Details</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function initScoreChart(distribution) {
        const ctx = document.getElementById('scoreChart').getContext('2d');
        const labels = Object.keys(distribution);
        const values = Object.values(distribution);

        if (scoreChart) scoreChart.destroy();

        scoreChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Candidates',
                    data: values,
                    backgroundColor: [
                        'rgba(99, 102, 241, 0.8)',
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(244, 63, 94, 0.8)'
                    ],
                    borderRadius: 8,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: body.classList.contains('dark-mode') ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                        ticks: { color: body.classList.contains('dark-mode') ? '#94a3b8' : '#64748b' }
                    },
                    x: { 
                        grid: { display: false },
                        ticks: { color: body.classList.contains('dark-mode') ? '#94a3b8' : '#64748b' }
                    }
                }
            }
        });
    }

    function initSplitChart(distribution) {
        const ctx = document.getElementById('splitChart').getContext('2d');
        const labels = Object.keys(distribution);
        const values = Object.values(distribution);

        if (splitChart) splitChart.destroy();

        splitChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: [
                        '#6366f1',
                        '#10b981',
                        '#f59e0b',
                        '#ef4444'
                    ],
                    borderWidth: 8,
                    borderColor: 'rgba(255, 255, 255, 0)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { 
                            padding: 20, 
                            usePointStyle: true,
                            color: body.classList.contains('dark-mode') ? '#94a3b8' : '#64748b'
                        }
                    }
                }
            }
        });
    }

    // --- Legacy / Analysis Logic ---
    if (allCandidatesTableBody) {
        loadAllCandidates();
    }

    async function loadAllCandidates(jobId = 'all') {
        try {
            const response = await fetch(`/api/candidates?job_id=${jobId}`);
            const data = await response.json();
            if (response.ok && data.success) {
                allCandidatesData = data.candidates;
                renderAllCandidates();
            }
        } catch (err) { console.error(err); }
    }

    function renderAllCandidates() {
        if (!allCandidatesTableBody) return;
        if (allCandidatesData.length === 0) {
            allCandidatesTableBody.innerHTML = `<tr class="empty-state"><td colspan="5" style="text-align:center; padding: 4rem;">No candidates available.</td></tr>`;
            return;
        }

        if (document.getElementById('candidatesSortFilter')) {
            const sortVal = document.getElementById('candidatesSortFilter').value;
            if (sortVal === 'score_desc') allCandidatesData.sort((a,b) => b.final_score - a.final_score);
            else if (sortVal === 'score_asc') allCandidatesData.sort((a,b) => a.final_score - b.final_score);
            else if (sortVal === 'skills_desc') allCandidatesData.sort((a,b) => b.skills_score - a.skills_score);
        }

        allCandidatesTableBody.innerHTML = allCandidatesData.map((result, index) => {
            let badgeClass = 'badge-info';
            if (result.recommendation === "Strong Hire") badgeClass = 'badge-success';
            else if (result.recommendation === "Consider") badgeClass = 'badge-warning';
            else if (result.recommendation === "Reject") badgeClass = 'badge-danger';

            return `
                <tr>
                    <td>
                        <div class="candidate-cell">
                            <div class="candidate-avatar">${result.name.charAt(0)}</div>
                            <div class="candidate-info">
                                <h4>${result.name}</h4>
                                <p>${result.email}</p>
                            </div>
                        </div>
                    </td>
                    <td><span style="font-weight:600">${result.skills_score}%</span></td>
                    <td><strong>${result.final_score}</strong>/100</td>
                    <td><span class="badge ${badgeClass}">${result.recommendation}</span></td>
                    <td>
                        <div style="display: flex; gap: 0.5rem; justify-content: center;">
                            <button class="btn btn-secondary btn-sm view-db-details" data-index="${index}">View</button>
                            ${userSettings.email_enabled ? `<button class="btn btn-outline btn-sm send-email-btn" data-index="${index}" title="Send Email"><i class="fa-solid fa-envelope"></i></button>` : ''}
                            ${result.has_resume ? `<button class="btn btn-outline btn-sm apply-download-btn" onclick="window.location.href='/api/download_resume/${result.id}'"><i class="fa-solid fa-download"></i></button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        document.querySelectorAll('.view-db-details').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = e.target.closest('button').getAttribute('data-index');
                openModal(allCandidatesData[index]);
            });
        });

        document.querySelectorAll('.send-email-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = e.target.closest('button').getAttribute('data-index');
                openEmailModal(allCandidatesData[index]);
            });
        });
    }

    if (browseBtn && fileInput && dropZone && analyzeBtn) {
        browseBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(name => dropZone.addEventListener(name, prevent, false));
        function prevent(e) { e.preventDefault(); e.stopPropagation(); }
        ['dragenter', 'dragover'].forEach(name => dropZone.addEventListener(name, () => dropZone.classList.add('dragover')));
        ['dragleave', 'drop'].forEach(name => dropZone.addEventListener(name, () => dropZone.classList.remove('dragover')));
        dropZone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
    }

    function handleFiles(files) {
        for (let file of files) {
            const ext = file.name.split('.').pop().toLowerCase();
            if (['pdf', 'doc', 'docx'].includes(ext)) {
                if (!selectedFiles.some(f => f.name === file.name)) selectedFiles.push(file);
            }
        }
        renderFileList();
    }

    function renderFileList() {
        if (!fileList) return;
        fileList.innerHTML = selectedFiles.map((file, index) => `
            <div class="file-item" style="display:flex; justify-content:space-between; padding: 0.5rem; background:#f8fafc; border-radius:8px; margin-bottom:0.5rem; border:1px solid #e2e8f0">
                <span><i class="fa-solid fa-file-pdf"></i> ${file.name}</span>
                <i class="fa-solid fa-xmark remove-file" data-index="${index}" style="cursor:pointer; color:var(--danger)"></i>
            </div>
        `).join('');
        document.querySelectorAll('.remove-file').forEach(i => i.addEventListener('click', (e) => {
            selectedFiles.splice(e.target.getAttribute('data-index'), 1);
            renderFileList();
        }));
    }

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', async () => {
            const jd = jobDescription.value.trim();
            if (!jd || selectedFiles.length === 0) {
                alert("Please provide JD and Resumes.");
                return;
            }
            const formData = new FormData();
            formData.append('job_description', jd);
            if (jobSelect && jobSelect.value !== 'new') {
                formData.append('job_id', jobSelect.value);
            }
            selectedFiles.forEach(f => formData.append('resumes', f));
            loaderOverlay.classList.remove('hidden');
            try {
                const res = await fetch('/api/analyze', { method: 'POST', body: formData });
                const data = await res.json();
                if (res.ok) {
                    processingResults = data.results;
                    renderResults();
                    if (exportBtn) exportBtn.disabled = false;
                    // Reload jobs in case any stats changed (though they aren't in the jobs call)
                    // and also reload candidate list if we were on that page
                    if (allCandidatesTableBody) loadAllCandidates();
                }
            } catch (err) { alert(err.message); }
            finally { loaderOverlay.classList.add('hidden'); }
        });
    }

    function renderResults() {
        if (!resultsTableBody) return;
        resultsTableBody.innerHTML = processingResults.map((res, index) => {
            if (res.error) return `<tr><td>-</td><td>${res.filename}</td><td colspan="4" style="color:var(--danger)">${res.error}</td></tr>`;
            let badgeClass = res.recommendation === 'Strong Hire' ? 'badge-success' : (res.recommendation === 'Reject' ? 'badge-danger' : 'badge-warning');
            return `
                <tr>
                    <td><div class="rank-badge">${res.rank}</div></td>
                    <td>
                        <div class="candidate-cell">
                            <div class="candidate-avatar">${res.name.charAt(0)}</div>
                            <div class="candidate-info"><h4>${res.name}</h4><p>${res.email}</p></div>
                        </div>
                    </td>
                    <td>${res.skills_score}%</td>
                    <td><strong>${res.final_score}</strong>/100</td>
                    <td><span class="badge ${badgeClass}">${res.recommendation}</span></td>
                    <td>
                        <div style="display: flex; gap: 0.5rem; justify-content: center;">
                            <button class="btn btn-secondary btn-sm view-details" data-index="${index}">View</button>
                            ${userSettings.email_enabled ? `<button class="btn btn-outline btn-sm send-email-btn-results" data-index="${index}" title="Send Email"><i class="fa-solid fa-envelope"></i></button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        document.querySelectorAll('.view-details').forEach(btn => btn.addEventListener('click', (e) => openModal(processingResults[e.target.closest('button').dataset.index])));
        document.querySelectorAll('.send-email-btn-results').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = e.target.closest('button').getAttribute('data-index');
                openEmailModal(processingResults[index]);
            });
        });
    }

    function openModal(data) {
        if (!data || !candidateModal) return;
        document.getElementById('mName').textContent = data.name;
        document.getElementById('mEmail').textContent = data.email;
        document.getElementById('mFinalScore').textContent = data.final_score;
        document.getElementById('mRecommendation').textContent = data.recommendation;
        document.getElementById('mSummary').textContent = data.summary;
        document.getElementById('mSkillsScore').textContent = data.skills_score;
        document.getElementById('mExpScore').textContent = data.experience_score;
        document.getElementById('mEduScore').textContent = data.education_score;
        
        setTimeout(() => {
            document.getElementById('mSkillsFill').style.width = `${data.skills_score}%`;
            document.getElementById('mExpFill').style.width = `${data.experience_score}%`;
            document.getElementById('mEduFill').style.width = `${data.education_score}%`;
        }, 100);

        const list = document.getElementById('mSkillsList');
        list.innerHTML = data.skills ? data.skills.split(',').map(s => `<span class="skill-tag">${s.trim()}</span>`).join('') : "None";
        document.getElementById('mExperience').textContent = data.experience || "N/A";
        document.getElementById('mEducation').textContent = data.education || "N/A";
        candidateModal.classList.remove('hidden');
    }

    closeModalElements.forEach(el => el && el.addEventListener('click', () => {
        candidateModal.classList.add('hidden');
        ['mSkillsFill', 'mExpFill', 'mEduFill'].forEach(id => document.getElementById(id).style.width = '0%');
    }));

    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const jobId = (jobSelect && jobSelect.value !== 'new') ? jobSelect.value : (candidatesJobFilter ? candidatesJobFilter.value : 'all');
            window.location.href = `/api/export?job_id=${jobId}`;
        });
    }

    // --- Email Logic ---
    let selectedCandidateForEmail = null;

    function populateEmailTemplate(candidate, templateType) {
        if (!candidate) return;
        const jobTitle = candidate.job_title || 'a role';
        
        switch (templateType) {
            case 'invite':
                emailSubject.value = `Interview Invitation - HRMS.ai`;
                emailBody.value = `Hi ${candidate.name},\n\nThank you for applying for the position. Your profile stood out to our team, and we would love to invite you for an interview to discuss your experience and see if there is a mutual fit.\n\nPlease let us know your availability for a 30-minute introductory call next week.\n\nBest regards,\nHRMS.ai Team`;
                break;
            case 'confirmation':
                emailSubject.value = `Application Received: ${jobTitle} - HRMS.ai`;
                emailBody.value = `Hi ${candidate.name},\n\nThis is a confirmation that we have successfully received your application for the ${jobTitle} position at HRMS.ai.\n\nOur team is currently reviewing your profile against our requirements. If your diverse background matches our needs, we will be in touch shortly regarding next steps.\n\nThank you for your interest in joining us.\n\nBest regards,\nHRMS.ai Recruiting`;
                break;
            case 'rejection':
                emailSubject.value = `Status Update on Your Application - HRMS.ai`;
                emailBody.value = `Hi ${candidate.name},\n\nThank you for taking the time to apply for the ${jobTitle} position at HRMS.ai.\n\nWhile your skills and background are impressive, we have decided to move forward with other candidates whose qualifications more closely align with the specific needs of this role at this time.\n\nWe will keep your resume on file for future opportunities. We wish you the best in your job search.\n\nBest regards,\nHRMS.ai Team`;
                break;
            case 'custom':
            default:
                emailSubject.value = `Hiring Update: ${jobTitle}`;
                emailBody.value = `Hi ${candidate.name},\n\nThank you for your interest in the position. We have reviewed your application and would like to...\n\nBest regards,\nHRMS.ai Team`;
                break;
        }
    }

    function openEmailModal(candidate) {
        if (!candidate || !emailModal) return;
        
        selectedCandidateForEmail = candidate;
        emailCandidateName.textContent = candidate.name;
        emailRecipient.value = candidate.email;
        if(emailTemplate) emailTemplate.value = 'custom';
        
        populateEmailTemplate(candidate, 'custom');
        
        emailFeedback.style.display = 'none';
        emailModal.classList.remove('hidden');
    }

    if (emailTemplate) {
        emailTemplate.addEventListener('change', (e) => {
            populateEmailTemplate(selectedCandidateForEmail, e.target.value);
        });
    }

    if (closeEmailModal) closeEmailModal.addEventListener('click', () => emailModal.classList.add('hidden'));
    if (cancelEmailBtn) cancelEmailBtn.addEventListener('click', () => emailModal.classList.add('hidden'));
    if (emailModalOverlay) emailModalOverlay.addEventListener('click', () => emailModal.classList.add('hidden'));

    if (confirmSendEmailBtn) {
        confirmSendEmailBtn.addEventListener('click', async () => {
            if (!selectedCandidateForEmail) return;

            const subject = emailSubject.value.trim();
            const body = emailBody.value.trim();

            if (!subject || !body) {
                showEmailFeedback("Please provide both subject and message.", "danger");
                return;
            }

            confirmSendEmailBtn.disabled = true;
            confirmSendEmailBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Loading...';
            
            // 1. Construct URL based on provider settings
            const recipient = encodeURIComponent(selectedCandidateForEmail.email);
            const encodedSubject = encodeURIComponent(subject);
            const encodedBody = encodeURIComponent(body);
            let targetUrl = `mailto:${recipient}?subject=${encodedSubject}&body=${encodedBody}`;

            if (userSettings.email_provider === 'gmail') {
                const uPath = userSettings.sender_email ? `u/${userSettings.sender_email}/` : '';
                targetUrl = `https://mail.google.com/mail/${uPath}?view=cm&fs=1&to=${recipient}&su=${encodedSubject}&body=${encodedBody}`;
            } else if (userSettings.email_provider === 'outlook') {
                const hint = userSettings.sender_email ? `&login_hint=${encodeURIComponent(userSettings.sender_email)}` : '';
                targetUrl = `https://outlook.live.com/mail/0/deeplink/compose?to=${recipient}&subject=${encodedSubject}&body=${encodedBody}${hint}`;
            }

            try {
                // 2. Silently log to CRM
                await fetch('/api/send_email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        candidate_id: selectedCandidateForEmail.id,
                        subject: subject,
                        body: body
                    })
                });

                // 3. Command the OS/Browser to open the mail client
                if (userSettings.email_provider === 'native') {
                    window.location.href = targetUrl;
                } else {
                    window.open(targetUrl, '_blank');
                }
                
                showEmailFeedback("Email interface opened successfully!", "success");
                setTimeout(() => {
                    emailModal.classList.add('hidden');
                    confirmSendEmailBtn.disabled = false;
                    confirmSendEmailBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Email';
                }, 1500);
                
            } catch (err) {
                showEmailFeedback("Network error logging history. Please try again.", "danger");
                confirmSendEmailBtn.disabled = false;
                confirmSendEmailBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Email';
            }
        });
    }

    if (cancelEmailBtn) cancelEmailBtn.addEventListener('click', () => emailModal.classList.add('hidden'));
    if (emailModalOverlay) emailModalOverlay.addEventListener('click', () => emailModal.classList.add('hidden'));

    // --- Settings UI Interactions ---
    if (emailEnabledToggle) {
        emailEnabledToggle.addEventListener('change', (e) => {
            toggleEmailProviderSection(e.target.checked);
        });
    }

    if (emailProviderSelect) {
        emailProviderSelect.addEventListener('change', (e) => {
            updateProviderInfo(e.target.value);
        });
    }

    function toggleEmailProviderSection(enabled) {
        if (!emailProviderSection) return;
        emailProviderSection.style.opacity = enabled ? '1' : '0.4';
        emailProviderSection.style.pointerEvents = enabled ? 'all' : 'none';
    }

    function updateProviderInfo(provider) {
        if (!providerInfoDivs.native) return; // Not on settings page
        
        // Show/Hide sender email section
        if (senderEmailSection) {
            senderEmailSection.style.display = (provider === 'gmail' || provider === 'outlook') ? 'block' : 'none';
        }

        Object.keys(providerInfoDivs).forEach(key => {
            if (providerInfoDivs[key]) {
                providerInfoDivs[key].style.display = key === provider ? 'block' : 'none';
            }
        });
    }

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', async () => {
            const payload = {
                email_enabled: emailEnabledToggle.checked,
                email_provider: emailProviderSelect.value,
                sender_email: senderEmailInput ? senderEmailInput.value : null
            };

            saveSettingsBtn.disabled = true;
            saveSettingsBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';

            try {
                const response = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();

                if (data.success) {
                    userSettings = payload;
                    settingsFeedback.style.display = 'block';
                    settingsFeedback.style.background = 'rgba(74, 222, 128, 0.1)';
                    settingsFeedback.style.color = '#166534';
                    settingsFeedback.textContent = data.message;
                    setTimeout(() => settingsFeedback.style.display = 'none', 3000);
                }
            } catch (err) {
                console.error("Save settings error:", err);
            } finally {
                saveSettingsBtn.disabled = false;
                saveSettingsBtn.innerHTML = '<i class="fa-solid fa-save"></i> Save Changes';
            }
        });
    }

    // --- Global Search Logic ---
    const searchInput = document.getElementById('globalSearchInput');
    const searchResults = document.getElementById('searchResults');
    const searchBar = document.getElementById('globalSearchBar');
    let searchTimeout = null;

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            
            clearTimeout(searchTimeout);
            if (!query) {
                searchResults.classList.remove('active');
                return;
            }

            searchTimeout = setTimeout(() => {
                performSearch(query);
            }, 300);
        });

        // Hide results on click outside
        document.addEventListener('click', (e) => {
            if (searchBar && !searchBar.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.classList.remove('active');
            }
        });

        // Show results on focus if not empty
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim()) {
                searchResults.classList.add('active');
            }
        });
    }

    async function performSearch(query) {
        searchBar.classList.add('loading');
        searchResults.classList.add('active');
        searchResults.innerHTML = '<div class="search-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Searching...</div>';

        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await response.json();

            if (data.success) {
                renderSearchResults(data.results);
            }
        } catch (err) {
            console.error("Search error:", err);
            searchResults.innerHTML = '<div class="search-empty"><i class="fa-solid fa-circle-exclamation"></i> Error fetching results</div>';
        } finally {
            searchBar.classList.remove('loading');
        }
    }

    function renderSearchResults(results) {
        const { candidates, jobs } = results;
        
        if (candidates.length === 0 && jobs.length === 0) {
            searchResults.innerHTML = '<div class="search-empty"><i class="fa-solid fa-search"></i> No results found</div>';
            return;
        }

        let html = '';

        if (candidates.length > 0) {
            html += '<div class="search-section-title"><span>Candidates</span> <i class="fa-solid fa-users"></i></div>';
            candidates.forEach(c => {
                html += `
                    <div class="search-item candidate-search-item" data-id="${c.id}">
                        <div class="search-item-icon"><i class="fa-solid fa-user"></i></div>
                        <div class="search-item-info">
                            <h4>${c.name}</h4>
                            <p>${c.job_title} • ${c.recommendation} (${c.final_score}/100)</p>
                        </div>
                    </div>
                `;
            });
        }

        if (jobs.length > 0) {
            html += '<div class="search-section-title"><span>Job Openings</span> <i class="fa-solid fa-briefcase"></i></div>';
            jobs.forEach(j => {
                html += `
                    <a href="/jobs" class="search-item">
                        <div class="search-item-icon"><i class="fa-solid fa-briefcase"></i></div>
                        <div class="search-item-info">
                            <h4>${j.title}</h4>
                            <p>${new Date(j.created_at).toLocaleDateString()}</p>
                        </div>
                    </a>
                `;
            });
        }

        searchResults.innerHTML = html;

        // Add event listeners to candidate items to open modal
        document.querySelectorAll('.candidate-search-item').forEach(item => {
            item.addEventListener('click', async () => {
                const id = item.dataset.id;
                searchResults.classList.remove('active');
                
                // Fetch full candidate data
                try {
                    const res = await fetch(`/api/candidates`); 
                    const data = await res.json();
                    const candidate = data.candidates.find(c => c.id == id);
                    if (candidate) {
                        openModal(candidate);
                    } else {
                        window.location.href = '/candidates';
                    }
                } catch(e) { 
                    console.error(e);
                    window.location.href = '/candidates';
                }
            });
        });
    }

    function showEmailFeedback(msg, type) {
        emailFeedback.textContent = msg;
        emailFeedback.style.display = 'block';
        emailFeedback.className = type === 'success' ? 'badge-success' : 'badge-danger';
        emailFeedback.style.backgroundColor = type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
        emailFeedback.style.color = type === 'success' ? '#10b981' : '#ef4444';
        emailFeedback.style.border = `1px solid ${type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`;
    }
});
