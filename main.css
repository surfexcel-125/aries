/* --- Global Styles: Setting the Stage --- */
body {
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    background-color: white; /* Plain white screen */
    display: flex;
    flex-direction: column; 
    min-height: 100vh; 
    overflow-x: hidden; /* Prevents horizontal scrollbar */
}

/* Wrapper to hold all content—NO shifting/shrinking */
.page-wrapper {
    width: 100%;
    display: flex;
    flex-direction: column; 
    flex-grow: 1; 
}

/* --- Header Styles: The Black Bar --- */
header {
    background-color: black;
    color: white;
    padding: 15px 20px;
    height: 50px; 
    display: flex;
    align-items: center; 
    justify-content: flex-start; 
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}

/* --- Menu Icon Styles --- */
.menu-icon {
    font-size: 28px;
    cursor: pointer;
    user-select: none;
    line-height: 1; 
}

/* --- Sidebar Styles (Overlay/Cover Effect) --- */
.sidebar {
    height: 100%;
    width: 0; /* Starts hidden off-screen */
    position: fixed; /* Makes it overlay the content */
    z-index: 100; /* Stays above other content */
    top: 0;
    left: 0;
    background-color: black; 
    overflow-x: hidden;
    padding-top: 60px; 
    transition: 0.3s ease-in-out; 
}

/* Class added by JavaScript to make the sidebar appear */
.sidebar.open {
    width: 250px; /* The width of the sidebar when open */
}

/* Sidebar Header and Close Arrow */
.sidebar-header {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    padding: 15px 0;
}

.close-icon {
    color: white;
    font-size: 28px;
    cursor: pointer;
    line-height: 1;
    display: inline-block;
    padding-left: 10px; 
    transform: rotate(90deg); /* Rotates the arrow */
}

/* --- Sidebar Button Styling (Exact Look Requested) --- */
.sidebar-button {
    padding: 10px 15px;
    text-decoration: none;
    font-size: 14px;
    
    /* STYLES matching the image: */
    background-color: white; /* White background */
    color: black; /* Black text */
    border: 1px solid white; /* A white border for structure */
    border-radius: 8px; /* Rounded corners */
    
    display: block; 
    margin: 10px 15px; 
    text-align: center;
    
    font-family: Arial, sans-serif;
    font-weight: bold;
    transition: background-color 0.2s, opacity 0.2s; 
}

.sidebar-button:hover {
    background-color: #f0f0f0; /* Slight gray on hover */
    opacity: 0.9; 
    color: black; 
}

/* --- Main Content Layout --- */
main {
    flex-grow: 1; 
    display: flex; 
    justify-content: center; 
    align-items: center; 
    padding: 20px; 
    gap: 50px; 
}

.content-left {
    text-align: right; 
    padding-right: 20px; 
}

.content-right {
    display: flex; 
    align-items: center;
    justify-content: center;
    padding-left: 20px; 
}

/* --- Text Styling (Aries King) --- */
.aries-title {
    font-family: 'Luckiest Guy', cursive; /* Substitute for Snap ITC */
    font-size: 80px; 
    margin: 0; 
    line-height: 0.8; 
    color: black;
}

.aries-subtitle {
    font-family: 'Roboto Slab', serif; /* Substitute for Amasis MT Pro Black */
    font-weight: 900; 
    font-size: 24px;
    margin: 0;
    color: #333;
}

/* --- Goat Image Styling --- */
.goat-image {
    max-width: 350px; 
    height: auto; 
}

/* --- Optional: Responsive adjustments for phones/tablets --- */
@media (max-width: 768px) {
    main {
        flex-direction: column; 
        gap: 20px;
    }
    .content-left, .content-right {
        text-align: center; 
        padding: 0;
    }
    .aries-title {
        font-size: 60px;
    }
    .aries-subtitle {
        font-size: 20px;
    }
    .goat-image {
        max-width: 250px;
    }
    
    .sidebar.open {
        width: 100%; /* Sidebar takes full screen on mobile */
    }
}
