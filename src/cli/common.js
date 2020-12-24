const apply = program => {
  program
    .requiredOption('-r, --redis-endpoint <uri>', 'Redis endpoint')
}

export default apply
