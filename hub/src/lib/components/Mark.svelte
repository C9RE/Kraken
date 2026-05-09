<script>
	let { size = 18 } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
	<!-- Stylised compass-rose / kraken eye -->
	<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.25" />
	<path d="M12 2 L13.5 12 L12 22 L10.5 12 Z" fill="currentColor" opacity="0.85"/>
	<path d="M2 12 L12 13.5 L22 12 L12 10.5 Z" fill="currentColor" opacity="0.55"/>
	<circle cx="12" cy="12" r="1.5" fill="currentColor" />
</svg>
