import { Module } from '@nestjs/common';
import { AnubisController } from './anubis.controller';
import { Reconciler } from './reconciler';

@Module({ controllers: [AnubisController], providers: [Reconciler] })
export default class AnubisModule {}
