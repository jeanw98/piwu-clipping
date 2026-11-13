import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user';
import {
  AddProjectReferencesDto,
  CreateProjectDto,
  UpdateProjectDto,
} from './dto/projects.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projectsService.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user, dto);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projectsService.getById(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projectsService.delete(user, id);
  }

  @Post(':id/references')
  addReferences(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddProjectReferencesDto,
  ) {
    return this.projectsService.addReferences(user, id, dto);
  }

  @Delete(':id/references/:refId')
  deleteReference(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('refId') refId: string,
  ) {
    return this.projectsService.deleteReference(user, id, refId);
  }
}
