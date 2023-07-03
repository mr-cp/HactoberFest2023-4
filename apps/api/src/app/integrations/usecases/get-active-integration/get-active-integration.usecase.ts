import { Injectable } from '@nestjs/common';

import { SelectIntegration, SelectIntegrationCommand } from '@novu/application-generic';
import { ChannelTypeEnum } from '@novu/shared';
import { IntegrationEntity, IntegrationRepository, EnvironmentRepository } from '@novu/dal';

import { GetActiveIntegrationsCommand } from './get-active-integration.command';
import { GetActiveIntegrationResponseDto } from '../../dtos/get-active-integration-response.dto';

@Injectable()
export class GetActiveIntegrations {
  constructor(
    private integrationRepository: IntegrationRepository,
    private selectIntegration: SelectIntegration,
    private environmentRepository: EnvironmentRepository
  ) {}

  async execute(command: GetActiveIntegrationsCommand): Promise<GetActiveIntegrationResponseDto[]> {
    const activeIntegration = await this.integrationRepository.find({
      _organizationId: command.organizationId,
      active: true,
    });

    if (!activeIntegration.length) {
      return [];
    }

    const activeIntegrationChannelTypes = this.getDistinctChannelTypes(activeIntegration);
    const selectedIntegrations = await this.getSelectedIntegrations(command, activeIntegrationChannelTypes);

    return this.mapBySelectedIntegration(activeIntegration, selectedIntegrations);
  }

  private getDistinctChannelTypes(activeIntegration: IntegrationEntity[]): ChannelTypeEnum[] {
    return activeIntegration.map((integration) => integration.channel).filter(this.distinct);
  }

  distinct = (value, index, self) => {
    return self.indexOf(value) === index;
  };

  private mapBySelectedIntegration(
    activeIntegration: IntegrationEntity[],
    selectedIntegrations: IntegrationEntity[]
  ): GetActiveIntegrationResponseDto[] {
    return activeIntegration.map((integration) => {
      const selected = selectedIntegrations.find((selectedIntegration) => selectedIntegration._id === integration._id);

      return selected ? { ...integration, selected: true } : { ...integration, selected: false };
    });
  }

  private async getSelectedIntegrations(
    command: GetActiveIntegrationsCommand,
    activeIntegrationChannelTypes: ChannelTypeEnum[]
  ) {
    const environments = await this.environmentRepository.findOrganizationEnvironments(command.organizationId);

    const integrationPromises = this.selectIntegrationByEnvironment(
      environments,
      command,
      activeIntegrationChannelTypes
    );

    return (await Promise.all(integrationPromises)).filter(notNullish);
  }

  private selectIntegrationByEnvironment(
    environments,
    command: GetActiveIntegrationsCommand,
    activeIntegrationChannelTypes: ChannelTypeEnum[]
  ) {
    return environments.flatMap((environment) =>
      this.selectIntegrationByChannelType(environment._id, command, activeIntegrationChannelTypes)
    );
  }

  private selectIntegrationByChannelType(
    environmentId,
    command: GetActiveIntegrationsCommand,
    activeIntegrationChannelTypes: ChannelTypeEnum[]
  ) {
    return activeIntegrationChannelTypes.map(async (channelType) => {
      return await this.selectIntegration.execute(
        SelectIntegrationCommand.create({
          environmentId: environmentId,
          organizationId: command.organizationId,
          userId: command.userId,
          channelType: channelType as ChannelTypeEnum,
          providerId: command.providerId,
        })
      );
    });
  }
}

export function notNullish<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}
