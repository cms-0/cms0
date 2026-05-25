<script setup lang="ts">
import { onMounted } from 'vue';
import { data } from './data/cms0';

  onMounted(async () => {
    const { heroSection, id } = await data.HomePage();
    console.log('headline: ', heroSection.headline.locales.en?.html ?? '', ' | id: ', id);
  })

  const edit = async () => {
    await data.HomePage.update({
      heroSection: {
        trustedByLabel: {
          defaultLocale: 'en',
          locales: {
            en: 'Trusted by growing teams',
          },
        },
      },
    })
  }
</script>

<template>
  <h1>You did it!</h1>
  <p>
    Visit <a href="https://vuejs.org/" target="_blank" rel="noopener">vuejs.org</a> to read the
    documentation
    <button v-on:click="edit">edit home</button>
  </p>
</template>

<style scoped></style>
