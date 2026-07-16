import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let allProperties = [];
let areasById = new Map();
let servicesById = new Map();
let banners = [];
let activeBannerIndex = 0;
let bannerTimer = null;
let detailsGalleryTimer = null;
let activeAreaId = null;
let activeSearchTerm = '';

document.addEventListener('DOMContentLoaded', async () => {
    initPropertySearch();
    initDetailsModal();
    initBottomNavigation();
    await loadStorefrontData();
});

async function loadStorefrontData() {
    const slider = document.getElementById('slider-container');

    try {
        slider.innerHTML = '<p class="empty-message">جاري تحميل العقارات...</p>';
        await fetchAreas();
        await fetchServices();
        await fetchBanners();
        await fetchProperties();
        renderBanners();
        renderAreaButtons();
        renderFilteredProperties();
        updateStats(allProperties);
    } catch (error) {
        console.error('Error loading storefront data:', error);
        slider.innerHTML = '<p class="empty-message">تعذر تحميل العقارات. تأكد من صلاحيات Firebase والاتصال بالانترنت.</p>';
    }
}

async function fetchAreas() {
    const snapshot = await getDocs(collection(db, 'areas'));
    areasById = new Map();
    snapshot.forEach((doc) => areasById.set(doc.id, doc.data().name || 'بدون منطقة'));
}

async function fetchServices() {
    const snapshot = await getDocs(collection(db, 'services'));
    servicesById = new Map();
    snapshot.forEach((doc) => servicesById.set(doc.id, doc.data().name || 'خدمة'));
}

async function fetchBanners() {
    const snapshot = await getDocs(collection(db, 'banners'));
    banners = [];
    snapshot.forEach((doc) => banners.push({ id: doc.id, ...doc.data() }));
    banners.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

async function fetchProperties() {
    const snapshot = await getDocs(collection(db, 'properties'));
    allProperties = [];
    snapshot.forEach((doc) => allProperties.push({ id: doc.id, ...doc.data() }));
    allProperties.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

function renderBanners() {
    const slider = document.getElementById('banner-slider');
    const dots = document.getElementById('banner-dots');
    if (!slider || !dots) return;

    clearInterval(bannerTimer);
    activeBannerIndex = 0;

    if (banners.length === 0) {
        slider.innerHTML = '<div class="banner-placeholder">لا توجد بنرات إعلانية حالياً.</div>';
        dots.innerHTML = '';
        return;
    }

    slider.innerHTML = banners.map((banner, index) => `
        <div class="banner-slide ${index === 0 ? 'active' : ''}" style="background-image: url('${escapeHtml(banner.imageUrl || '')}')"></div>
    `).join('');
    dots.innerHTML = banners.map((_, index) => `<span class="banner-dot ${index === 0 ? 'active' : ''}"></span>`).join('');

    if (banners.length > 1) {
        bannerTimer = setInterval(showNextBanner, 4000);
    }
}

function showNextBanner() {
    const slides = document.querySelectorAll('.banner-slide');
    const dots = document.querySelectorAll('.banner-dot');
    if (slides.length <= 1) return;

    const currentIndex = activeBannerIndex;
    const nextIndex = (activeBannerIndex + 1) % slides.length;
    slides[currentIndex].classList.remove('active');
    slides[currentIndex].classList.add('exit');
    slides[nextIndex].classList.remove('exit');
    slides[nextIndex].classList.add('active');
    dots[currentIndex]?.classList.remove('active');
    dots[nextIndex]?.classList.add('active');
    activeBannerIndex = nextIndex;

    setTimeout(() => slides[currentIndex]?.classList.remove('exit'), 700);
}

function initBottomNavigation() {
    document.querySelectorAll('.bottom-nav .nav-item').forEach((item) => {
        item.addEventListener('click', (event) => {
            event.preventDefault();
            const view = item.dataset.view || 'home';
            showView(view);
        });
    });
}

function showView(view) {
    document.querySelectorAll('.bottom-nav .nav-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.view === view);
    });

    const homeSections = document.querySelectorAll('.main-header, .banner-section, .stats-container, .areas-section, .featured-section');
    const investmentView = document.getElementById('investment-view');
    const showInvestment = view === 'investment';

    homeSections.forEach((section) => {
        section.hidden = showInvestment;
    });
    if (investmentView) investmentView.hidden = !showInvestment;

    if (view === 'home') {
        activeAreaId = null;
        activeSearchTerm = '';
        const searchInput = document.getElementById('property-search-input');
        if (searchInput) searchInput.value = '';
        renderFilteredProperties();
        document.querySelectorAll('.area-btn').forEach((item) => item.classList.remove('active'));
        document.querySelector('.area-btn')?.classList.add('active');
    }

    if (view === 'sold') {
        const soldProperties = allProperties.filter((property) => normalizeStatus(property.status).key === 'sold');
        renderProperties(soldProperties);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAreaButtons() {
    const container = document.getElementById('areas-container');
    if (!container) return;

    container.innerHTML = '';
    const allButton = createAreaButton('الكل', null);
    allButton.classList.add('active');
    container.appendChild(allButton);
    areasById.forEach((name, id) => container.appendChild(createAreaButton(name, id)));
}

function createAreaButton(name, areaId) {
    const button = document.createElement('button');
    button.className = 'area-btn';
    button.innerHTML = `
        <span>${escapeHtml(name)}</span>
    `;
    button.addEventListener('click', () => {
        document.querySelectorAll('.area-btn').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        activeAreaId = areaId;
        renderFilteredProperties();
    });
    return button;
}

function initPropertySearch() {
    const input = document.getElementById('property-search-input');
    const button = document.getElementById('property-search-btn');
    if (!input || !button) return;

    const runSearch = () => {
        activeSearchTerm = normalizeSearchText(input.value);
        renderFilteredProperties();
    };

    button.addEventListener('click', runSearch);
    input.addEventListener('input', runSearch);
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            runSearch();
        }
    });
}

function renderFilteredProperties() {
    const filtered = allProperties.filter((property) => {
        const matchesArea = activeAreaId ? property.areaId === activeAreaId : true;
        const matchesSearch = activeSearchTerm ? propertyMatchesSearch(property, activeSearchTerm) : true;
        return matchesArea && matchesSearch;
    });

    renderProperties(filtered, activeSearchTerm, !(activeSearchTerm || activeAreaId));
}

function renderProperties(properties, searchTerm = '', preferFeatured = true) {
    const slider = document.getElementById('slider-container');
    slider.innerHTML = '';

    if (properties.length === 0) {
        slider.innerHTML = `<p class="empty-message">${searchTerm ? 'لا توجد نتائج مطابقة للبحث.' : 'لا توجد عقارات حالياً.'}</p>`;
        return;
    }

    const featured = preferFeatured ? properties.filter((property) => property.isFeatured) : [];
    const visibleProperties = featured.length > 0 ? featured : properties;
    visibleProperties.forEach((property) => slider.appendChild(createPropertyCard(property)));
}

function createPropertyCard(property) {
    const status = normalizeStatus(property.status);
    const statusClass = status.key === 'available' ? 'badge-available' : 'badge-reserved';
    const whatsappUrl = getWhatsappUrl(property);
    const images = getPropertyImages(property);
    const image = images[0];
    const thumbnails = images.slice(0, 6);

    const card = document.createElement('div');
    card.className = 'property-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `تفاصيل ${property.title || 'العقار'}`);
    card.innerHTML = `
        <div class="card-img" style="background-image: url('${escapeHtml(image)}')">
            ${property.isFeatured ? '<span class="badge-featured">★ مميز</span>' : ''}
            <span class="badge-status ${statusClass}"><i class="fas fa-circle" style="font-size: 8px; margin-left: 3px;"></i> ${escapeHtml(status.label)}</span>
        </div>
        <div class="card-thumbnails" aria-label="صور العقار">
            ${thumbnails.map((thumb, index) => `
                <button
                    type="button"
                    class="card-thumb ${index === 0 ? 'active' : ''}"
                    data-image="${escapeHtml(thumb)}"
                    aria-label="عرض صورة ${index + 1}"
                    style="background-image: url('${escapeHtml(thumb)}')"
                ></button>
            `).join('')}
        </div>
        <div class="card-content">
            <div class="card-title">${escapeHtml(property.title || 'عقار بدون عنوان')}</div>
            <div class="card-area"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(getAreaName(property.areaId))}</div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
                <button class="whatsapp-btn" data-whatsapp="${escapeHtml(whatsappUrl)}" style="background: white; border: 1px solid var(--primary-blue); color: var(--primary-blue); width: 40px; height: 40px; border-radius: 12px; cursor: pointer;">
                    <i class="fas fa-phone-alt"></i>
                </button>
                <div>
                    <div style="font-size: 12px; color: var(--text-gray); text-align: left;">السعر المطلوب</div>
                    <div class="card-price">${formatPrice(property.price)}</div>
                </div>
            </div>
        </div>
    `;

    card.addEventListener('click', () => openPropertyDetails(property));
    card.querySelector('.whatsapp-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        openWhatsapp(property);
    });
    card.querySelectorAll('.card-thumb').forEach((thumb) => {
        thumb.addEventListener('click', (event) => {
            event.stopPropagation();
            const cardImage = card.querySelector('.card-img');
            const nextImage = thumb.dataset.image;
            if (!cardImage || !nextImage) return;
            cardImage.style.backgroundImage = `url('${nextImage}')`;
            card.querySelectorAll('.card-thumb').forEach((item) => item.classList.remove('active'));
            thumb.classList.add('active');
        });
    });
    card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPropertyDetails(property);
        }
    });

    return card;
}

function initDetailsModal() {
    const modal = document.getElementById('property-details-modal');
    const closeButton = document.getElementById('property-details-close');
    if (!modal || !closeButton) return;

    closeButton.addEventListener('click', closePropertyDetails);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closePropertyDetails();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('open')) closePropertyDetails();
    });
}

function openPropertyDetails(property) {
    const modal = document.getElementById('property-details-modal');
    const body = document.getElementById('property-details-body');
    if (!modal || !body) return;

    stopDetailsGalleryAutoFlip();

    const status = normalizeStatus(property.status);
    const images = getPropertyImages(property);
    const services = getPropertyServices(property);
    const mapUrl = getMapUrl(property);
    const whatsappUrl = getWhatsappUrl(property);
    const preciseLocation = hasPreciseLocation(property);
    const phone = getPropertyPhone(property);
    const officeCommission = getOfficeCommission(property);
    const priceTotal = getPriceTotal(property);
    const commissionNote = getCommissionNote(property);
    const areaName = getAreaName(property.areaId);

    body.innerHTML = `
        <div class="details-gallery" data-active-image="0">
            ${images.map((image, index) => `
                <div class="details-image ${index === 0 ? 'active' : ''}" style="background-image: url('${escapeHtml(image)}')"></div>
            `).join('')}
            ${images.length > 1 ? `
                <div class="details-gallery-dots">
                    ${images.map((_, index) => `<span class="${index === 0 ? 'active' : ''}"></span>`).join('')}
                </div>
            ` : ''}
        </div>
        <div class="details-content">
            <section class="details-section details-summary-section">
                <div class="details-title-row">
                    <h2 id="property-details-title">${escapeHtml(property.title || 'عقار بدون عنوان')}</h2>
                    <div class="details-price">${formatPrice(property.price)}</div>
                </div>
                <div class="details-area-name">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>المنطقة</span>
                    <strong>${escapeHtml(areaName)}</strong>
                </div>
                <div class="details-grid">
                    <div class="details-item">
                        <i class="fas fa-info-circle"></i>
                        <span>النوع</span>
                        <strong>${escapeHtml(property.type || 'غير محدد')}</strong>
                    </div>
                    <div class="details-item">
                        <i class="fas fa-expand"></i>
                        <span>المساحة</span>
                        <strong>${formatSpace(property.space)}</strong>
                    </div>
                    <div class="details-item">
                        <i class="fas fa-arrows-alt"></i>
                        <span>الأبعاد</span>
                        <strong>${escapeHtml(property.dimensions || 'غير محددة')}</strong>
                    </div>
                    <div class="details-item">
                        <i class="far fa-calendar-alt"></i>
                        <span>تاريخ الإضافة</span>
                        <strong>${formatDate(property.createdAt)}</strong>
                    </div>
                </div>
            </section>
            <section class="details-section details-description-section">
                <p class="details-description">${escapeHtml(property.description || 'لا يوجد وصف لهذا العقار.')}</p>
                ${services.length > 0 ? `<div class="details-service-block"><h3>الخدمات</h3><div class="details-services">${services.map((service) => `<span class="details-chip">${escapeHtml(service)}</span>`).join('')}</div></div>` : ''}
            </section>
            <div class="commission-card">
                <div class="commission-breakdown">
                    <div class="commission-line">
                        <span>سعر العقار</span>
                        <strong>${formatPrice(property.price)}</strong>
                    </div>
                    <div class="commission-line">
                        <span>عمولة المكتب</span>
                        <strong>${formatPrice(officeCommission)}</strong>
                    </div>
                </div>
                <div class="commission-total">
                    <span>المجموع</span>
                    <strong>${formatPrice(priceTotal)}</strong>
                </div>
                <div class="commission-note">
                    <i class="fas fa-info-circle"></i>
                    <span>ملاحظة</span>
                    <p>${escapeHtml(commissionNote)}</p>
                </div>
            </div>
            <section class="details-map-section">
                <h3>الموقع</h3>
                <a class="details-map-card" href="${mapUrl}" target="_blank" rel="noopener" aria-label="فتح موقع العقار">
                    <span><i class="fas fa-map-marker-alt"></i></span>
                </a>
            </section>
            <section class="lead-request-card">
                <h3>سجل طلبك</h3>
                <form class="lead-request-form">
                    <input type="text" name="customerName" placeholder="اسم الزبون" autocomplete="name">
                    <input type="tel" name="customerPhone" placeholder="رقم الهاتف" autocomplete="tel">
                    <textarea name="customerNeed" rows="3" placeholder="اكتب شنو تحتاج أو شنو التعديل المطلوب"></textarea>
                    <button type="submit"><i class="fab fa-whatsapp"></i> إرسال الطلب</button>
                </form>
            </section>
            <div class="details-actions">
                ${whatsappUrl ? `<a class="details-action whatsapp-action" href="${whatsappUrl}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> واتساب</a>` : ''}
                ${phone ? `<a class="details-action call-action" href="tel:${escapeHtml(phone)}"><i class="fas fa-phone-volume"></i> اتصال</a>` : ''}
            </div>
        </div>
    `;

    const leadForm = body.querySelector('.lead-request-form');
    leadForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        submitLeadRequest(property, leadForm);
    });
    startDetailsGalleryAutoFlip(body);

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closePropertyDetails() {
    const modal = document.getElementById('property-details-modal');
    if (!modal) return;
    stopDetailsGalleryAutoFlip();
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

function startDetailsGalleryAutoFlip(scope) {
    const gallery = scope.querySelector('.details-gallery');
    const galleryImages = Array.from(scope.querySelectorAll('.details-image'));
    const dots = Array.from(scope.querySelectorAll('.details-gallery-dots span'));
    if (!gallery || galleryImages.length <= 1) return;

    detailsGalleryTimer = setInterval(() => {
        const currentIndex = Number(gallery.dataset.activeImage || 0);
        const nextIndex = (currentIndex + 1) % galleryImages.length;
        gallery.dataset.activeImage = String(nextIndex);
        galleryImages.forEach((image, index) => image.classList.toggle('active', index === nextIndex));
        dots.forEach((dot, index) => dot.classList.toggle('active', index === nextIndex));
    }, 4000);
}

function stopDetailsGalleryAutoFlip() {
    if (!detailsGalleryTimer) return;
    clearInterval(detailsGalleryTimer);
    detailsGalleryTimer = null;
}

function getPropertyImages(property) {
    const images = [];
    if (Array.isArray(property.images)) images.push(...property.images);
    images.push(property.image, property.imageUrl, property.mainImage, property.thumbnail);

    const cleanImages = [...new Set(images.map((image) => String(image || '').trim()).filter(Boolean))];
    if (cleanImages.length > 0) return cleanImages;

    return ['https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80'];
}

function getPropertyServices(property) {
    if (!Array.isArray(property.services)) return [];
    return property.services.map((serviceId) => servicesById.get(serviceId) || serviceId).filter(Boolean);
}

function openWhatsapp(property) {
    const whatsappUrl = getWhatsappUrl(property);
    if (!whatsappUrl) {
        alert('لا يوجد رقم واتساب محفوظ لهذا العقار.');
        return;
    }
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
}

function submitLeadRequest(property, form) {
    const whatsappUrl = getLeadRequestWhatsappUrl(property, form);
    if (!whatsappUrl) {
        alert('لا يوجد رقم واتساب محفوظ لهذا العقار.');
        return;
    }

    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
}

function getWhatsappUrl(property) {
    const phone = normalizePhoneForWhatsapp(getPropertyPhone(property));
    if (!phone) return '';
    const message = encodeURIComponent(`مرحبا، اريد الاستفسار عن العقار: ${property.title || ''}`);
    return `https://wa.me/${phone}?text=${message}`;
}

function getLeadRequestWhatsappUrl(property, form) {
    const phone = normalizePhoneForWhatsapp(getPropertyPhone(property));
    if (!phone) return '';

    const formData = new FormData(form);
    const customerName = String(formData.get('customerName') || '').trim();
    const customerPhone = String(formData.get('customerPhone') || '').trim();
    const customerNeed = String(formData.get('customerNeed') || '').trim();
    const message = [
        'مرحبا، لدي طلب على هذا العقار:',
        `العقار: ${property.title || 'بدون عنوان'}`,
        `المنطقة: ${getAreaName(property.areaId)}`,
        customerName ? `اسم الزبون: ${customerName}` : '',
        customerPhone ? `رقم الزبون: ${customerPhone}` : '',
        customerNeed ? `الطلب أو التعديل المطلوب: ${customerNeed}` : ''
    ].filter(Boolean).join('\n');

    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function getPropertyPhone(property) {
    return property.phone || property.whatsapp || property.phoneNumber || '';
}

function normalizePhoneForWhatsapp(phone) {
    let digits = String(phone || '').replace(/[^\d+]/g, '');
    if (!digits) return '';
    if (digits.startsWith('+')) return digits.slice(1);
    if (digits.startsWith('00')) return digits.slice(2);
    if (digits.startsWith('0')) return `964${digits.slice(1)}`;
    if (digits.startsWith('7')) return `964${digits}`;
    return digits;
}

function getMapUrl(property) {
    const lat = Number(property.location?.lat);
    const lng = Number(property.location?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

    const searchText = [property.title, getAreaName(property.areaId), 'جصان', 'العراق'].filter(Boolean).join(' ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchText)}`;
}

function hasPreciseLocation(property) {
    const lat = Number(property.location?.lat);
    const lng = Number(property.location?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng);
}

function getAreaName(areaId) {
    return areasById.get(areaId) || 'بدون منطقة';
}

function propertyMatchesSearch(property, searchTerm) {
    const searchableParts = [
        property.title,
        property.propertyNumber,
        property.type,
        property.description,
        property.dimensions,
        property.space,
        property.price,
        normalizeStatus(property.status).label,
        getAreaName(property.areaId),
        ...getPropertyServices(property)
    ];
    const searchableText = normalizeSearchText(searchableParts.filter(Boolean).join(' '));
    return searchTerm.split(' ').filter(Boolean).every((part) => searchableText.includes(part));
}

function normalizeSearchText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatPrice(price) {
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) return 'السعر غير محدد';
    return `${numericPrice.toLocaleString('ar-IQ')} د.ع`;
}

function getOfficeCommission(property) {
    const commission = Number(property.officeCommission ?? property.commission ?? property.officeFee ?? 0);
    return Number.isFinite(commission) && commission > 0 ? commission : 0;
}

function getPriceTotal(property) {
    const price = Number(property.price);
    const commission = getOfficeCommission(property);
    if (!Number.isFinite(price) || price <= 0) return commission;
    return price + commission;
}

function getCommissionNote(property) {
    return property.commissionNote
        || property.officeCommissionNote
        || 'ملاحظة: عمولة المكتب تضاف على سعر العقار وتدفع حسب الاتفاق وقت الشراء.';
}

function formatSpace(space) {
    const numericSpace = Number(space);
    if (!Number.isFinite(numericSpace) || numericSpace <= 0) return 'غير محددة';
    return `${numericSpace.toLocaleString('ar-IQ')} م²`;
}

function formatDate(timestamp) {
    const seconds = Number(timestamp?.seconds);
    if (!Number.isFinite(seconds) || seconds <= 0) return 'غير محدد';
    return new Date(seconds * 1000).toLocaleDateString('ar-IQ', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function updateStats(properties) {
    const availableCount = properties.filter((property) => normalizeStatus(property.status).key === 'available').length;
    const soldCount = properties.filter((property) => normalizeStatus(property.status).key === 'sold').length;
    const availableElement = document.getElementById('available-count');
    const soldElement = document.getElementById('sold-count');
    if (availableElement) availableElement.textContent = availableCount;
    if (soldElement) soldElement.textContent = soldCount;
}

function normalizeStatus(status) {
    const value = String(status || 'available').trim().toLowerCase();
    if (value === 'available' || value === 'متاح') return { key: 'available', label: 'متاح' };
    if (value === 'sold' || value === 'مباع' || value.includes('مباع')) return { key: 'sold', label: 'مباع' };
    if (value === 'reserved' || value === 'محجوز' || value.includes('محجوز')) return { key: 'reserved', label: 'محجوز' };
    return { key: 'reserved', label: status || 'غير متاح' };
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}
