// ===== RESERVATION PAGE JS =====
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('reserveForm');
    const dateInput = document.getElementById('date');
    const timeSlotsContainer = document.getElementById('timeSlots');
    const submitBtn = document.getElementById('submitBtn');
    const confirmationModal = document.getElementById('confirmationModal');

    let selectedSlot = null;

    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
    dateInput.value = today;

    // Set max date to 30 days from now
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    dateInput.max = maxDate.toISOString().split('T')[0];

    // Load slots for today immediately
    loadSlots(today);

    // When date changes, load slots
    dateInput.addEventListener('change', () => {
        selectedSlot = null;
        loadSlots(dateInput.value);
    });

    async function loadSlots(date) {
        timeSlotsContainer.innerHTML = '<p class="loading-text">Loading available slots...</p>';

        try {
            const data = await api(`/api/reservations/slots?date=${date}`);
            renderSlots(data.slots);
        } catch (err) {
            timeSlotsContainer.innerHTML = '<p class="error-text">Failed to load slots. Please try again.</p>';
            console.error(err);
        }
    }

    function renderSlots(slots) {
        if (slots.length === 0) {
            timeSlotsContainer.innerHTML = '<p class="placeholder-text">No slots available for this date.</p>';
            return;
        }

        let html = '';
        slots.forEach(slot => {
            const isAvailable = slot.available;
            const availText = isAvailable
                ? `${slot.availableTables} table${slot.availableTables > 1 ? 's' : ''} left`
                : 'Fully Booked';

            html += `
                <button type="button"
                    class="time-slot-btn ${!isAvailable ? 'disabled' : ''} ${slot.availableTables <= 3 && isAvailable ? 'limited' : ''}"
                    data-time="${slot.time}"
                    ${!isAvailable ? 'disabled' : ''}>
                    <span class="slot-time">${slot.label}</span>
                    <span class="slot-avail ${!isAvailable ? 'full' : slot.availableTables <= 3 ? 'limited' : ''}">${availText}</span>
                </button>
            `;
        });

        timeSlotsContainer.innerHTML = html;

        // Add click handlers
        timeSlotsContainer.querySelectorAll('.time-slot-btn:not(.disabled)').forEach(btn => {
            btn.addEventListener('click', () => {
                timeSlotsContainer.querySelector('.selected')?.classList.remove('selected');
                btn.classList.add('selected');
                selectedSlot = btn.dataset.time;
            });
        });
    }

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!selectedSlot) {
            showToast('Please select a time slot', 'error');
            return;
        }

        const formData = {
            name: form.name.value.trim(),
            email: form.email.value.trim(),
            phone: form.phone.value.trim(),
            date: dateInput.value,
            time_slot: selectedSlot,
            guests: parseInt(form.guests.value),
            special_requests: form.special_requests?.value.trim() || ''
        };

        // Basic validation
        if (!formData.name || !formData.email || !formData.phone || !formData.guests) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        if (!/^\S+@\S+\.\S+$/.test(formData.email)) {
            showToast('Please enter a valid email address', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-sm"></span> Booking...';

        try {
            const data = await api('/api/reservations', {
                method: 'POST',
                body: JSON.stringify(formData)
            });

            // Show confirmation modal
            const details = data.reservation;
            document.getElementById('confirmationDetails').innerHTML = `
                <div class="confirmation-card">
                    <div class="confirmation-item">
                        <span class="conf-label">Booking ID</span>
                        <span class="conf-value highlight">${details.booking_id}</span>
                    </div>
                    <div class="confirmation-item">
                        <span class="conf-label">Name</span>
                        <span class="conf-value">${details.name}</span>
                    </div>
                    <div class="confirmation-item">
                        <span class="conf-label">Date</span>
                        <span class="conf-value">${formatDate(details.date)}</span>
                    </div>
                    <div class="confirmation-item">
                        <span class="conf-label">Time</span>
                        <span class="conf-value">${details.time}</span>
                    </div>
                    <div class="confirmation-item">
                        <span class="conf-label">Table</span>
                        <span class="conf-value">Table #${details.table_number}</span>
                    </div>
                    <div class="confirmation-item">
                        <span class="conf-label">Guests</span>
                        <span class="conf-value">${details.guests}</span>
                    </div>
                </div>
                <p class="confirmation-note">A confirmation email has been sent to your email address. Please save your Booking ID for reference.</p>
            `;

            confirmationModal.classList.add('active');
            showToast('Table reserved successfully!', 'success');

            // Reset form
            form.reset();
            dateInput.value = today;
            selectedSlot = null;
            loadSlots(today);

        } catch (err) {
            showToast(err.message || 'Failed to reserve table', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Confirm Reservation';
        }
    });

    // Close modal
    if (confirmationModal) {
        confirmationModal.querySelector('.modal-overlay')?.addEventListener('click', () => {
            confirmationModal.classList.remove('active');
        });
    }
});
