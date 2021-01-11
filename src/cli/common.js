const apply = program => {
  program
    .requiredOption('-r, --redis-endpoint <uri>', 'Redis endpoint for non-critical data')
}

export default apply

export const cliParseInt = v => (parseInt(v) || 50)
