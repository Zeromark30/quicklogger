<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#09090b" />
  <title>quicklogger</title>
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
</svelte:head>

<main class="min-h-screen flex flex-col max-w-md mx-auto px-4 py-6">
  {@render children()}
</main>
