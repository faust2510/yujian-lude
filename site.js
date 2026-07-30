const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

if (!reduceMotion) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('is-visible')
    })
  }, { threshold: 0.16 })

  document.querySelectorAll('[data-reveal]').forEach((element) => revealObserver.observe(element))

  const processObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        document.querySelectorAll('[data-process-step]').forEach((step) => step.classList.remove('is-active'))
        entry.target.classList.add('is-active')
      }
    })
  }, { threshold: 0.62 })

  document.querySelectorAll('[data-process-step]').forEach((step) => processObserver.observe(step))

  const parallax = document.querySelector('[data-parallax]')
  if (parallax && window.matchMedia('(pointer: fine)').matches) {
    parallax.addEventListener('pointermove', (event) => {
      const rect = parallax.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width - .5) * 2
      const y = ((event.clientY - rect.top) / rect.height - .5) * 2
      parallax.style.setProperty('--media-x', `${x * -10}px`)
      parallax.style.setProperty('--media-y', `${y * -7}px`)
      parallax.style.setProperty('--glass-x', `${x * 16}px`)
      parallax.style.setProperty('--glass-y', `${y * 12}px`)
      parallax.style.setProperty('--line-x', `${x * 9}px`)
    })
    parallax.addEventListener('pointerleave', () => {
      ;['--media-x', '--media-y', '--glass-x', '--glass-y', '--line-x'].forEach((name) => parallax.style.removeProperty(name))
    })
  }

  if (window.matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('.magnetic').forEach((button) => {
      button.addEventListener('pointermove', (event) => {
        const rect = button.getBoundingClientRect()
        const x = (event.clientX - rect.left - rect.width / 2) * .11
        const y = (event.clientY - rect.top - rect.height / 2) * .11
        button.style.transform = `translate(${x}px, ${y}px)`
      })
      button.addEventListener('pointerleave', () => { button.style.removeProperty('transform') })
    })
  }
} else {
  document.querySelectorAll('[data-reveal]').forEach((element) => element.classList.add('is-visible'))
}
