import { RingApi } from 'ring-client-api'
import chalk from 'chalk'

export async function printRefreshToken(refreshToken: string): Promise<void> {
  const api = new RingApi({ refreshToken })

  await api.getCameras()

  api.onRefreshTokenUpdated.subscribe(({ newRefreshToken }) => {
    console.log(chalk.bold('\nYour Ring refresh token:'))
    console.log(chalk.green(newRefreshToken))
    console.log(chalk.dim('\nSet it as an environment variable:'))
    console.log(chalk.cyan(`  export RING_REFRESH_TOKEN="${newRefreshToken}"`))
    console.log(chalk.dim('\nOr add it to a .env file:'))
    console.log(chalk.cyan(`  RING_REFRESH_TOKEN=${newRefreshToken}`))
  })
}
